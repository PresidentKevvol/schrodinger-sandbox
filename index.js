var first_field;
var pyodide;

//simulation values
var array_dx = 0.04;
var hbar = 1;
var x_values;
var func_v;
var func_psi_init;
var t;

// number of eigenstates we are displaying
var num_eigenwaves;
// array of eigen values i.e. quantized energies
var eigen_energies;
// array of standing wave function arrays
// extracted back from python
var psi_standing;

//graph elements
var graph_init_psi_v;
var graph_eigenwaves;
var graph_wave_progression;

//the slider for eigenfunctions
var eigenfunc_slider;
// the input field for time for the animation
var time_field;


// for timer functions
if (window.performance.now) {
  console.log("Using high performance timer");
  getTimestamp = function() { return window.performance.now(); };
} else {
  if (window.performance.webkitNow) {
      console.log("Using webkit high performance timer");
      getTimestamp = function() { return window.performance.webkitNow(); };
  } else {
      console.log("Using low performance timer");
      getTimestamp = function() { return new Date().getTime(); };
  }
}

function ijs_setup() {
  pyodide_setup();

  first_field = document.getElementById("first-field");

  //for rendering static math
  //mathlive.renderMathInDocument();

  //to get the content in MathJSON, do this
  //first_field.expression.json;

  //to substitute a value for x, do this
  //first_field.expression.subs({x: 1}).N().valueOf();

  var graph_options = {
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      x: {display: false}
    }
  };

  graph_init_psi_v = new Chart("plot-potential-init-wave", {
    type: "line",
    data: {},
    options: graph_options
  });

  graph_eigenwaves = new Chart("plot-eigen-waves", {
    type: "line",
    data: {},
    options: graph_options
  });

  graph_wave_progression = new Chart("plot-wave-progression", {
    type: "line",
    data: {},
    options: graph_options
  });
  graph_wave_progression.options.animation = {duration: 0};

  document.getElementById("plot-init").addEventListener("click", plot_v_psi_clicked);
  document.getElementById("solve-eigenfuncs").addEventListener("click", solve_eigenwaves_clicked);

  eigenfunc_slider = document.getElementById("eigenfunc-display-slider");
  eigenfunc_slider.addEventListener("input", eigenfunc_slider_slided);
  time_field = document.getElementById("wave-t");
  time_field.addEventListener("input", time_field_changed);
}

//python function to solve the TISE given v(x) and psi(x, 0) as arrays
var solve_TISE_py = `
def solveTISE(xvec, h, potFunctVec):
    Nx = len(xvec)
    mat = -((np.tri(Nx,Nx,1)-np.tri(Nx,Nx,-2)-3.*np.eye(Nx))/h**2-np.diag(potFunctVec))
    # print(mat)
    eigenValues,eigenVectors = np.linalg.eig(mat)
    idx = eigenValues.argsort()[::1]   
    eigenValues = eigenValues[idx]
    eigenVectors = eigenVectors[:,idx]
    return eigenValues,eigenVectors
`;

//fourier type basis transform to transform a function to a set of coefficients of basis functions
var wave_basis_transform_py = `
def basis_transform(p, basis_set, h):
    l = len(basis_set)
    # generate series per the basis functions
    eigenfn_weights = []
    # weight of each eigenfunction by numerical integration
    for i in range(l):
        ci = np.sum(p * basis_set[i]) * h
        eigenfn_weights.append(ci)
    return eigenfn_weights
`;

//given a series of standing waves, their eigenvalues (energies), and set of coefficients
//to multiply them with, get the state of the wave at time t
var series_at_t_py = `
def series_wavefn_attime(coeffes, psi_fns, E_vals, t):
    l = len(coeffes)
    return sum([coeffes[i] * psi_fns[i] * np.exp(-1j * E_vals[i] * t / hbar) for i in range(l)])
`;

//setup pyodide to be used
async function pyodide_setup() {
  //setup pyodide
  pyodide = await loadPyodide();
  await pyodide.loadPackage("numpy");
  pyodide.runPython("import numpy as np");

  //test code
  pyodide.runPython("A = np.array([[3, 4, -2], [1, 4, -1], [2, 6, -1]])"); 
  pyodide.runPython("eig = np.linalg.eig(A)");
  pyodide.runPython("print(eig[0])");
  pyodide.runPython("print(eig[1])");

  //run these to import the js arrays into python runtime
  // pyodide.runPython("from js import x_values"); 
  // pyodide.runPython("from js import func_v");
  // pyodide.runPython("from js import func_psi_init");
  // pyodide.runPython("from js import array_dx, x_values, func_v, func_psi_init");
  // pyodide.runPython("x = np.array(list(x_values))");
  // pyodide.runPython("v = np.array(list(func_v))");
  // pyodide.runPython("psi_0 = np.array(list(func_psi_init))");

  //setup the function to solve the TISE
  pyodide.runPython(solve_TISE_py);
  pyodide.runPython(wave_basis_transform_py);
  pyodide.runPython(series_at_t_py);

  pyodide.runPython("from js import hbar");
  
  //pyodide.runPython("res = solveTISE(x, array_dx, v)");
}

//test graphing an eigenfunction from the solved set
function eigenfunc_graph_test() {
  q1 = pyodide.runPython("res[1][:,1]");
  q1j = [];
  for(var i=0; i<q1.length; i++) {q1j.push(q1.get(i));}
  graph_eigenwaves.data.datasets.push({fill: false,
    label: 'q1(x)',
    pointRadius: 0,
    borderColor: "rgba(0,255,0,0.8)",
    data: q1j}); 
  graph_eigenwaves.update(); 
}

function generate_function_array(sect, lower_bound, upper_bound, dx) {
  var pieces = sect.getElementsByClassName('equation-piece');

  var xvals = [];
  var yvals = [];

  // for each value of x in the domain space
  for (var x=lower_bound; x<=upper_bound; x+=dx) {
    var y = 0;
    //check each piecewise piece on the widget to get the y value corresponding to current x
    for (var i=0; i<pieces.length; i++) {
      var low = pieces[i].getElementsByClassName('range-low')[0].value;
      var high = pieces[i].getElementsByClassName('range-high')[0].value;

      if (low <= x && x <= high) {
        y = pieces[i].getElementsByClassName('equation-piece-field')[0].expression.subs({x: x}).N().valueOf();
        break;
      }
    }

    xvals.push(x);
    yvals.push(y);
  }
  return [xvals, yvals];
}

function plot_function_graph(vas_id, xvals, yvals) {
  var chart = new Chart(vas_id, {
    type: "line",
    data: {
      labels: xvals,
      datasets: [{
        fill: false,
        pointRadius: 0,
        borderColor: "rgba(255,0,0,0.5)",
        data: yvals
      }]
    },
    options: {
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {display: false}
      }
    }
  });
  return chart;
}

//test codes
function test_run() {
  jam = document.getElementById("equation-pieces-set-psi");
  b = generate_function_array(jam, -10, 10, 0.02);
  plot_function_graph("plot-potential-init-wave", b[0], b[1]);
}

function plot_v_psi_clicked() {
  psi_field = document.getElementById("equation-pieces-set-psi");
  psi = generate_function_array(psi_field, -10, 10, array_dx);
  v_field = document.getElementById("equation-pieces-set-v");
  v = generate_function_array(v_field, -10, 10, array_dx);

  x_values = v[0];
  func_psi_init = psi[1];
  func_v = v[1];

  //plot_function_graph("plot-potential-init-wave", b[0], b[1]);
  graph_init_psi_v.data.labels = x_values;
  graph_init_psi_v.data.datasets = [{
    fill: false,
    label: 'V(x)',
    pointRadius: 0,
    borderColor: "rgba(191,191,0,0.8)",
    data: func_v
  },
  {
    fill: false,
    label: 'Ψ(x, t=0)',
    pointRadius: 0,
    borderColor: "rgba(255,0,0,0.8)",
    data: func_psi_init
  }];
  graph_init_psi_v.update();
}

// when 'Solve for standing waves' button is clicked
async function solve_eigenwaves_clicked() {
  // import the arrays
  pyodide.runPython("from js import array_dx, x_values, func_v, func_psi_init");
  // convert to numpy arrays
  pyodide.runPython("x = np.array(list(x_values))");
  pyodide.runPython("v = np.array(list(func_v))");
  pyodide.runPython("psi_0 = np.array(list(func_psi_init))");

  console.log("function arrays loaded");

  //pyodide.runPython(solve_TISE_py);

  var t1 = getTimestamp();
  //use the function to solve the TISE
  pyodide.runPython("eigEnergies, eigFuncs = solveTISE(x, array_dx, v)");
  var t2 = getTimestamp();
  console.log("solver method finished, time taken: " + (t2 - t1));

  pyodide.runPython("l = int(eigFuncs.shape[0] ** 0.5)");
  // extract and normalize the standing waves
  pyodide.runPython("Psi_standing = [eigFuncs[:,i] / (array_dx ** 0.5) for i in range(l)]");

  // transfer variables to js
  num_eigenwaves = pyodide.runPython("l");
  psi_standing = [];
  psi_standing_py = pyodide.runPython("Psi_standing");
  eigen_energies = pyodide.runPython("eigEnergies[:l]");
  // load each eigen state function from python np array to js array
  for (var i=0; i<num_eigenwaves; i++) {
    var cur_wave = psi_standing_py.get(i);
    var cur_wave_j = [];
    for(var j=0; j<cur_wave.length; j++) {cur_wave_j.push(cur_wave.get(j));}
    psi_standing.push(cur_wave_j);
  }

  console.log("eigenstates loaded to js");

  graph_eigenwaves.data.labels = x_values;
  eigenfunc_slider.setAttribute("max", num_eigenwaves - 1);
  eigenfunc_slider.dispatchEvent(new Event("input"));

  //basis transform psi(x, 0) to coefficients
  pyodide.runPython("eig_fn_weights = basis_transform(psi_0, Psi_standing, array_dx)");
  //display the wave in the animation graph
  graph_wave_progression.data.labels = x_values;
  time_field.dispatchEvent(new Event("input"));
}

function eigenfunc_slider_slided(event) {
  if (!psi_standing) {
    return;
  }

  var slider_val = parseInt(event.target.value);
  graph_eigenwaves.data.datasets = [{
    fill: false,
    label: 'Eigen state ' + slider_val + ' (E = ' + eigen_energies.get(slider_val) + ')',
    pointRadius: 0,
    borderColor: "rgba(0,191,31,0.9)",
    data: psi_standing[slider_val]
  }];
  graph_eigenwaves.update();
}

function time_field_changed(event) {
  if (!psi_standing) {
    return;
  }

  //get t value
  t = parseFloat(event.target.value);
  //within the python runtime, calculate the wave at time t
  pyodide.runPython("from js import t");
  pyodide.runPython("wave_at_t = series_wavefn_attime(eig_fn_weights, Psi_standing, eigEnergies, t)");
  pyodide.runPython("wave_at_t_real = np.real(wave_at_t)");
  pyodide.runPython("wave_at_t_imag = np.imag(wave_at_t)");

  //convert them to js array to display on graph
  var wave_real = pyodide.runPython("wave_at_t_real");
  var wave_imag = pyodide.runPython("wave_at_t_imag");
  var wave_real_j = [];
  for(var j=0; j<wave_real.length; j++) {wave_real_j.push(wave_real.get(j));}
  var wave_imag_j = [];
  for(var j=0; j<wave_imag.length; j++) {wave_imag_j.push(wave_imag.get(j));}

  graph_wave_progression.data.datasets = [{
    fill: false,
    label: 'real',
    pointRadius: 0,
    borderColor: "rgba(0,31,255,0.9)",
    data: wave_real_j
  },
  {
    fill: false,
    label: 'imag',
    pointRadius: 0,
    borderColor: "rgba(255,127,0,0.9)",
    data: wave_imag_j
  }];
  graph_wave_progression.update();
}

document.addEventListener("DOMContentLoaded", ijs_setup);
