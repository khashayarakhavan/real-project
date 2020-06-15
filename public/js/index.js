/* eslint-disable */
import '@babel/polyfill'; // Bring newer JS features to older browsers using babel.
import { displayMap } from './mapbox';
import { login, logout } from './login';

// DOM ELEMENTS
const mapBox = document.getElementById('map');
const loginForm = document.querySelector('.form');
const logOutBtn = document.querySelector('.nav__el--logout');
 
// Delegation
if (mapBox) {
  const locations = JSON.parse(mapBox.dataset.locations); // import locations data embeded inside dataset attribute of 'map' element.
  displayMap(locations);
}

if (loginForm) {
  loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    login(email, password); // use Login function from login.js
  });
}

if (logOutBtn) {
  logOutBtn.addEventListener('click', logout);
}