import React from 'react';
import ReactDOM from 'react-dom';
import './styles/global.css';
import './styles/home.css';
import './styles/admin.css';
import Invasions from './pages/Invasions';

localStorage.setItem('paragon_token', '');
ReactDOM.render(
  <div className="admin"><section className="admin__main"><div className="admin__body"><Invasions me={{ role: 'oficial' }} /></div></section></div>,
  document.getElementById('root')
);
