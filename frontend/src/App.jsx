import React from 'react';
import { Route, Switch, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Embers from './components/Embers';
import Home from './pages/Home';
import Login from './pages/Login';
import Admin from './pages/Admin';
import ChangePassword from './pages/ChangePassword';
import ResetPassword from './pages/ResetPassword';
import CheckIn from './pages/CheckIn';
import LootReport from './pages/LootReport';
import InvasionPrompt from './components/InvasionPrompt';

export default function App() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin') || pathname === '/cambiar-clave' || pathname === '/restablecer' || pathname === '/invasiones' || pathname === '/cajas';

  return (
    <>
      <InvasionPrompt />
      {!isAdmin && <Embers />}
      {!isAdmin && <Navbar />}
      <Switch>
        <Route exact path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/admin" component={Admin} />
        <Route path="/cambiar-clave" component={ChangePassword} />
        <Route path="/restablecer" component={ResetPassword} />
        <Route path="/invasiones" component={CheckIn} />
        <Route path="/cajas" component={LootReport} />
      </Switch>
      {!isAdmin && <Footer />}
    </>
  );
}
