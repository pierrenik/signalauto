
import React from 'react';
// Routes and Route are part of the core react-router library. Re-exports in -dom may be missing in some environments.
import { Routes, Route } from 'react-router';
// HashRouter is specific to the web implementation in react-router-dom.
import { HashRouter } from 'react-router-dom';
import { SignalsProvider } from './context/SignalsContext.tsx';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SignalDetails from './pages/SignalDetails';
import Scanner from './pages/Scanner';
import Admin from './pages/Admin';
import { LoginGate } from './components/LoginGate';

const App: React.FC = () => {
  return (
    <SignalsProvider>
      <LoginGate>
        <HashRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/scanner" element={<Scanner />} />
              <Route path="/signal/:id" element={<SignalDetails />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
          </Layout>
        </HashRouter>
      </LoginGate>
    </SignalsProvider>
  );
};

export default App;
