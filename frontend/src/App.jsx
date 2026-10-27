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
import Clanes from './pages/Clanes';
import ClanDetail from './pages/ClanDetail';
import Personaje from './pages/Personaje';

export default function App() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin') || pathname === '/cambiar-clave' || pathname === '/restablecer' || pathname === '/invasiones' || pathname === '/cajas';

  return (
    <>
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
        <Route exact path="/clanes" component={Clanes} />
        <Route path="/clanes/:name" component={ClanDetail} />
        <Route path="/personaje/:name?" component={Personaje} />
      </Switch>
      {!isAdmin && <Footer />}
    </>
  );
}
