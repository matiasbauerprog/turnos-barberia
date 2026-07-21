import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { BookingPage } from './pages/BookingPage';
import { Login } from './components/admin/Login';
import { Dashboard } from './components/admin/Dashboard';
import { AdminProfile } from './components/admin/AdminProfile';
import { ServiceManagement } from './components/admin/ServiceManagement';
import { StaffManagement } from './components/admin/StaffManagement';
import { ClientManagement } from './components/admin/ClientManagement';
import { GlobalSettings } from './components/admin/GlobalSettings';
import './App.css';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/admin/login" />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<BookingPage />} />
        
        {/* Admin Routes */}
        <Route path="/admin/login" element={<Login />} />
        <Route 
          path="/admin" 
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/profile" 
          element={
            <PrivateRoute>
              <AdminProfile />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/services" 
          element={
            <PrivateRoute>
              <ServiceManagement />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/staff" 
          element={
            <PrivateRoute>
              <StaffManagement />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/clients" 
          element={
            <PrivateRoute>
              <ClientManagement />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/settings" 
          element={
            <PrivateRoute>
              <GlobalSettings />
            </PrivateRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
