const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const api = {
  getServices: async () => {
    const res = await fetch(`${API_URL}/servicios`);
    if (!res.ok) throw new Error('Error al cargar servicios');
    return res.json();
  },

  getProfessionals: async () => {
    const res = await fetch(`${API_URL}/profesionales`);
    if (!res.ok) throw new Error('Error al cargar profesionales');
    return res.json();
  },

  checkClientByPhone: async (phone) => {
    try {
      const res = await fetch(`${API_URL}/cliente/${phone}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.nombre;
    } catch (e) {
      return null;
    }
  },

  getConfig: async () => {
    try {
      const res = await fetch(`${API_URL}/config`);
      if (res.ok) return res.json();
    } catch(err) {
      console.warn("Could not fetch config from backend, using defaults");
    }
    // Return sensible defaults if backend config isn't ready
    return { nombreLocal: 'Estilo Cruz', logoUrl: '/logo.png', telefonoContacto: '+54 9 11 3414-1804' };
  },

  async fetchAvailability(fecha, servicioId, profesionalId) {
    const res = await fetch(`${API_URL}/disponibilidad?fecha=${fecha}&servicioId=${servicioId}&profesionalId=${profesionalId}`);
    if (!res.ok) throw new Error('Error al cargar disponibilidad');
    return res.json();
  },

  async createTurno(turnoData) {
    const res = await fetch(`${API_URL}/turnos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(turnoData)
    });
    if (!res.ok) throw new Error('Error al crear el turno');
    return res.json();
  },

  getClients: async () => {
    const res = await fetch(`${API_URL}/admin/clientes`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Error al cargar clientes');
    return res.json();
  },

  getClientHistory: async (telefono) => {
    const res = await fetch(`${API_URL}/admin/clientes/${telefono}/historial`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Error al cargar historial del cliente');
    return res.json();
  },

  // Admin endpoints
  async login(email, password) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error('Credenciales inválidas');
    const data = await res.json();
    localStorage.setItem('token', data.token);
    localStorage.setItem('barber', JSON.stringify(data.profesional));
    return data;
  },

  async fetchAdminTurnos(fecha) {
    let url = `${API_URL}/admin/turnos`;
    if (fecha) url += `?fecha=${fecha}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Error al cargar turnos');
    return res.json();
  },

  async updateProfile(profileData) {
    const res = await fetch(`${API_URL}/admin/perfil`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(profileData)
    });
    if (!res.ok) throw new Error('Error al actualizar el perfil');
    return res.json();
  },

  async deleteTurno(turnoId) {
    const res = await fetch(`${API_URL}/admin/turnos/${turnoId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error al cancelar el turno');
    return res.json();
  },

  async updateTurnoStatus(turnoId, estado) {
    const res = await fetch(`${API_URL}/admin/turnos/${turnoId}/estado`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ estado })
    });
    if (!res.ok) throw new Error('Error al actualizar estado');
    return res.json();
  },

  async createService(serviceData) {
    const res = await fetch(`${API_URL}/admin/servicios`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(serviceData)
    });
    if (!res.ok) throw new Error('Error al crear servicio');
    return res.json();
  },

  async updateService(id, serviceData) {
    const res = await fetch(`${API_URL}/admin/servicios/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(serviceData)
    });
    if (!res.ok) throw new Error('Error al actualizar servicio');
    return res.json();
  },

  async deleteService(id) {
    const res = await fetch(`${API_URL}/admin/servicios/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error al eliminar servicio');
    return res.json();
  },

  // Staff management
  async getAdminStaff() {
    const res = await fetch(`${API_URL}/admin/staff`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Error al cargar staff');
    return res.json();
  },

  async createStaff(staffData) {
    const res = await fetch(`${API_URL}/admin/staff`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(staffData)
    });
    if (!res.ok) throw new Error('Error al crear peluquero');
    return res.json();
  },

  async updateStaff(id, staffData) {
    const res = await fetch(`${API_URL}/admin/staff/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(staffData)
    });
    if (!res.ok) throw new Error('Error al actualizar peluquero');
    return res.json();
  },

  async deleteStaff(id) {
    const res = await fetch(`${API_URL}/admin/staff/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error al eliminar peluquero');
    return res.json();
  },
  
  async updateStaffPermissions(id, canEditServices) {
    const res = await fetch(`${API_URL}/admin/staff/${id}/permissions`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ canEditServices })
    });
    if (!res.ok) throw new Error('Error al actualizar permisos');
    return res.json();
  },

  // Settings
  async updateConfig(configData) {
    const res = await fetch(`${API_URL}/admin/config`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(configData)
    });
    if (!res.ok) throw new Error('Error al guardar configuración');
    return res.json();
  },
  // Time blocks
  async getBlocks(fecha) {
    let url = `${API_URL}/admin/bloques`;
    if (fecha) url += `?fecha=${fecha}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Error al cargar bloqueos');
    return res.json();
  },

  async createBlock(data) {
    const res = await fetch(`${API_URL}/admin/bloques`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Error al crear bloqueo');
    return res.json();
  },

  async deleteBlock(id) {
    const res = await fetch(`${API_URL}/admin/bloques/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error al eliminar bloqueo');
    return res.json();
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('barber');
  }
};
