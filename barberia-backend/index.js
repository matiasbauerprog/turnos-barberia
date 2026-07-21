const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');
const { parse, addMinutes, isBefore, isAfter, format } = require('date-fns');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: falta la variable de entorno JWT_SECRET. Copiá .env.example a .env y definila.');
  process.exit(1);
}

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Endpoint: Obtener Servicios
app.get('/api/servicios', async (req, res) => {
  try {
    const servicios = await prisma.servicio.findMany();
    res.json(servicios);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// Endpoint: Obtener Configuración Global (Public)
app.get('/api/config', async (req, res) => {
  try {
    let config = await prisma.configuracion.findUnique({ where: { id: 'global' } });
    if (!config) {
      config = await prisma.configuracion.create({ data: { id: 'global' } });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener configuracion' });
  }
});

// Endpoint: Obtener Profesionales
app.get('/api/profesionales', async (req, res) => {
  try {
    const profesionales = await prisma.profesional.findMany({
      select: { id: true, nombre: true, horarioAtencionInicio: true, horarioAtencionFin: true, imagenUrl: true }
    });
    res.json(profesionales);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener profesionales' });
  }
});

// Helper to parse "HH:mm" on a fixed date
const parseTime = (timeStr) => parse(timeStr, 'HH:mm', new Date(2000, 0, 1));

/**
 * Endpoint: Disponibilidad
 * GET /api/disponibilidad?fecha=YYYY-MM-DD&servicioId=UUID
 */
app.get('/api/disponibilidad', async (req, res) => {
  try {
    const { fecha, servicioId, profesionalId } = req.query;
    if (!fecha || !servicioId || !profesionalId) {
      return res.status(400).json({ error: 'Fecha, servicioId y profesionalId son requeridos' });
    }

    const servicio = await prisma.servicio.findUnique({ where: { id: servicioId } });
    if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado' });

    const profesional = await prisma.profesional.findUnique({ where: { id: profesionalId } });
    if (!profesional) return res.status(404).json({ error: 'Profesional no encontrado' });

    // 1. Obtener turnos ocupados
    const turnosOcupados = await prisma.turno.findMany({
      where: {
        profesionalId: profesional.id,
        fecha: fecha,
        estado: { not: 'CANCELADO' }
      },
      orderBy: { horaInicio: 'asc' }
    });

    // 1b. Obtener bloqueos de horario
    const bloqueos = await prisma.bloqueHorario.findMany({
      where: {
        profesionalId: profesional.id,
        fecha: fecha
      }
    });

    // 2. Calcular huecos
    const slots = [];
    let currentStartTime = parseTime(profesional.horarioAtencionInicio);
    const endTime = parseTime(profesional.horarioAtencionFin);
    const duracionServicioMinutos = servicio.duracionMinutos;

    const occupiedIntervals = [
      ...turnosOcupados.map(t => ({
        start: parseTime(t.horaInicio),
        end: parseTime(t.horaFin)
      })),
      ...bloqueos.map(b => ({
        start: parseTime(b.horaInicio),
        end: parseTime(b.horaFin)
      }))
    ];

    while (isBefore(currentStartTime, endTime)) {
      const nextPotentialEnd = addMinutes(currentStartTime, duracionServicioMinutos);
      
      if (isAfter(nextPotentialEnd, endTime)) break;
      
      let hasConflict = false;
      for (const interval of occupiedIntervals) {
        if (isBefore(currentStartTime, interval.end) && isBefore(interval.start, nextPotentialEnd)) {
          hasConflict = true;
          currentStartTime = interval.end; // Saltamos al final del turno ocupado
          break;
        }
      }
      
      if (!hasConflict) {
        slots.push(format(currentStartTime, 'HH:mm'));
        currentStartTime = nextPotentialEnd; 
      }
    }

    res.json({ slots });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/cliente/:telefono', async (req, res) => {
  try {
    const turno = await prisma.turno.findFirst({
      where: { clienteTelefono: req.params.telefono },
      orderBy: { createdAt: 'desc' },
      select: { clienteNombre: true }
    });
    res.json({ nombre: turno ? turno.clienteNombre : null });
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar cliente' });
  }
});

/**
 * Middleware: Autenticación
 */
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acceso no autorizado' });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Token inválido' });
  }
};

// Endpoint: Actualizar Configuración Global (Admin/Owner)
app.put('/api/admin/config', authenticate, async (req, res) => {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Solo el dueño puede editar la configuración' });
  try {
    const { nombreLocal, logoUrl, telefonoContacto, diasAbiertos } = req.body;
    const updated = await prisma.configuracion.upsert({
      where: { id: 'global' },
      update: { nombreLocal, logoUrl, telefonoContacto, diasAbiertos },
      create: { id: 'global', nombreLocal, logoUrl, telefonoContacto, diasAbiertos }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar configuracion' });
  }
});

/**
 * Endpoint: Login
 */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const profesional = await prisma.profesional.findUnique({ where: { email } });
    if (!profesional) return res.status(404).json({ error: 'Usuario no encontrado' });

    const validPassword = await bcrypt.compare(password, profesional.passwordHash);
    if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const token = jwt.sign(
      { id: profesional.id, email: profesional.email, role: profesional.role, canEditServices: profesional.canEditServices },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ 
      token, 
      profesional: { 
        id: profesional.id, 
        nombre: profesional.nombre, 
        email: profesional.email,
        role: profesional.role, 
        canEditServices: profesional.canEditServices,
        horarioAtencionInicio: profesional.horarioAtencionInicio,
        horarioAtencionFin: profesional.horarioAtencionFin,
        imagenUrl: profesional.imagenUrl
      } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Error en el login' });
  }
});

/**
 * Endpoint: Obtener Turnos (Admin)
 */
app.get('/api/admin/turnos', authenticate, async (req, res) => {
  try {
    const { fecha } = req.query;
    const where = {
      profesionalId: req.user.id
    };
    if (fecha) where.fecha = fecha;

    const turnos = await prisma.turno.findMany({
      where,
      include: { servicio: true },
      orderBy: { horaInicio: 'asc' }
    });
    res.json(turnos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener turnos' });
  }
});

app.delete('/api/admin/turnos/:id', authenticate, async (req, res) => {
  try {
    const turno = await prisma.turno.findUnique({ where: { id: req.params.id } });
    if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
    if (req.user.role !== 'OWNER' && turno.profesionalId !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    await prisma.turno.delete({ where: { id: req.params.id } });
    res.json({ message: 'Turno cancelado exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al cancelar turno' });
  }
});

app.patch('/api/admin/turnos/:id/estado', authenticate, async (req, res) => {
  try {
    const turno = await prisma.turno.findUnique({ where: { id: req.params.id } });
    if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
    if (req.user.role !== 'OWNER' && turno.profesionalId !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const updated = await prisma.turno.update({
      where: { id: req.params.id },
      data: { estado: req.body.estado } // e.g. CONFIRMADO, CANCELADO, ASISTIO
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar estado del turno' });
  }
});

app.get('/api/admin/clientes', authenticate, async (req, res) => {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Solo el dueño' });
  try {
    const turnos = await prisma.turno.findMany({
      orderBy: { createdAt: 'desc' },
      select: { clienteNombre: true, clienteTelefono: true, createdAt: true, estado: true }
    });
    const clientesMap = new Map();
    turnos.forEach(t => {
      if (!clientesMap.has(t.clienteTelefono)) {
        clientesMap.set(t.clienteTelefono, { 
          telefono: t.clienteTelefono, 
          nombre: t.clienteNombre, 
          totalTurnos: 0, 
          ultimoTurno: t.createdAt,
          completados: 0,
          cancelados: 0,
          pendientes: 0
        });
      }
      const c = clientesMap.get(t.clienteTelefono);
      c.totalTurnos++;
      if (t.estado === 'ASISTIO') c.completados++;
      else if (t.estado === 'CANCELADO') c.cancelados++;
      else c.pendientes++;
    });
    res.json(Array.from(clientesMap.values()));
  } catch (error) {
    res.status(500).json({ error: 'Error al recuperar clientes' });
  }
});

app.get('/api/admin/clientes/:telefono/historial', authenticate, async (req, res) => {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Solo el dueño' });
  try {
    const turnos = await prisma.turno.findMany({
      where: { clienteTelefono: req.params.telefono },
      include: { servicio: true, profesional: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(turnos);
  } catch (error) {
    res.status(500).json({ error: 'Error al recuperar historial' });
  }
});

/**
 * Endpoint: Actualizar Perfil (Admin)
 */
app.put('/api/admin/perfil', authenticate, async (req, res) => {
  try {
    const { nombre, email, horarioAtencionInicio, horarioAtencionFin, imagenUrl, password } = req.body;
    let data = { nombre, email, horarioAtencionInicio, horarioAtencionFin, imagenUrl };
    
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.profesional.update({
      where: { id: req.user.id },
      data
    });
    res.json({ id: updated.id, nombre: updated.nombre, email: updated.email, role: updated.role, horarioAtencionInicio: updated.horarioAtencionInicio, horarioAtencionFin: updated.horarioAtencionFin, imagenUrl: updated.imagenUrl });
  } catch (error) {
    console.error('Error al actualizar el perfil:', error);
    res.status(500).json({ error: 'Error al actualizar el perfil' });
  }
});

/**
 * Endpoints: Gestión de Servicios (Admin)
 */
app.get('/api/admin/servicios', authenticate, async (req, res) => {
  if (req.user.role !== 'OWNER' && !req.user.canEditServices) return res.status(403).json({ error: 'No tienes permiso para gestionar servicios' });
  const servicios = await prisma.servicio.findMany();
  res.json(servicios);
});

app.post('/api/admin/servicios', authenticate, async (req, res) => {
  if (req.user.role !== 'OWNER' && !req.user.canEditServices) return res.status(403).json({ error: 'No tienes permiso para gestionar servicios' });
  const { nombre, duracionMinutos, precio } = req.body;
  const nuevo = await prisma.servicio.create({ data: { nombre, duracionMinutos, precio: parseFloat(precio) } });
  res.json(nuevo);
});

app.put('/api/admin/servicios/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'OWNER' && !req.user.canEditServices) return res.status(403).json({ error: 'No tienes permiso para gestionar servicios' });
  const { nombre, duracionMinutos, precio } = req.body;
  const updated = await prisma.servicio.update({
    where: { id: req.params.id },
    data: { nombre, duracionMinutos, precio: parseFloat(precio) }
  });
  res.json(updated);
});

app.delete('/api/admin/servicios/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'OWNER' && !req.user.canEditServices) return res.status(403).json({ error: 'No tienes permiso para gestionar servicios' });
  await prisma.servicio.delete({ where: { id: req.params.id } });
  res.json({ message: 'Servicio eliminado' });
});

/**
 * Endpoints: Gestión de Staff (Solo OWNER)
 */
app.get('/api/admin/staff', authenticate, async (req, res) => {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Solo el dueño puede gestionar staff' });
  const staff = await prisma.profesional.findMany({
    select: { id: true, nombre: true, email: true, role: true, canEditServices: true, horarioAtencionInicio: true, horarioAtencionFin: true, imagenUrl: true }
  });
  res.json(staff);
});

app.post('/api/admin/staff', authenticate, async (req, res) => {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Solo el dueño puede gestionar staff' });
  const { nombre, email, password, role, horarioAtencionInicio, horarioAtencionFin, canEditServices } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const nuevo = await prisma.profesional.create({
    data: { nombre, email, passwordHash: hashedPassword, role, horarioAtencionInicio, horarioAtencionFin, canEditServices: !!canEditServices }
  });
  res.json(nuevo);
});

app.put('/api/admin/staff/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Solo el dueño puede gestionar staff' });
  const { nombre, email, password, role, horarioAtencionInicio, horarioAtencionFin, canEditServices } = req.body;
  
  const data = {
    nombre,
    email,
    role,
    horarioAtencionInicio,
    horarioAtencionFin,
    canEditServices: !!canEditServices
  };

  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const updated = await prisma.profesional.update({
    where: { id: req.params.id },
    data
  });
  res.json(updated);
});

app.patch('/api/admin/staff/:id/permissions', authenticate, async (req, res) => {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Solo el dueño puede gestionar permisos' });
  const { canEditServices } = req.body;
  const updated = await prisma.profesional.update({
    where: { id: req.params.id },
    data: { canEditServices }
  });
  res.json(updated);
});

app.delete('/api/admin/staff/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Solo el dueño puede gestionar staff' });
  if (req.user.id === req.params.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  
  await prisma.bloqueHorario.deleteMany({ where: { profesionalId: req.params.id } });
  await prisma.turno.deleteMany({ where: { profesionalId: req.params.id } });
  await prisma.profesional.delete({ where: { id: req.params.id } });
  res.json({ message: 'Peluquero eliminado' });
});

// ========= BLOQUEO DE HORARIOS =========

app.get('/api/admin/bloques', authenticate, async (req, res) => {
  try {
    const { fecha } = req.query;
    const where = { profesionalId: req.user.id };
    if (fecha) where.fecha = fecha;
    const bloques = await prisma.bloqueHorario.findMany({
      where,
      orderBy: { horaInicio: 'asc' }
    });
    res.json(bloques);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener bloqueos' });
  }
});

app.post('/api/admin/bloques', authenticate, async (req, res) => {
  try {
    const { fecha, horaInicio, horaFin, motivo } = req.body;
    if (!fecha || !horaInicio || !horaFin) {
      return res.status(400).json({ error: 'Fecha, horaInicio y horaFin son requeridos' });
    }
    const bloque = await prisma.bloqueHorario.create({
      data: {
        profesionalId: req.user.id,
        fecha,
        horaInicio,
        horaFin,
        motivo: motivo || null
      }
    });
    res.status(201).json(bloque);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear bloqueo' });
  }
});

app.delete('/api/admin/bloques/:id', authenticate, async (req, res) => {
  try {
    const bloque = await prisma.bloqueHorario.findUnique({ where: { id: req.params.id } });
    if (!bloque) return res.status(404).json({ error: 'Bloqueo no encontrado' });
    if (bloque.profesionalId !== req.user.id && req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    await prisma.bloqueHorario.delete({ where: { id: req.params.id } });
    res.json({ message: 'Bloqueo eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar bloqueo' });
  }
});

/**
 * Endpoint: Reservar Turno
 * POST /api/turnos
 */
app.post('/api/turnos', async (req, res) => {
  try {
    const { servicioId, profesionalId, fecha, horaInicio, clienteNombre, clienteTelefono } = req.body;

    const servicio = await prisma.servicio.findUnique({ where: { id: servicioId } });
    const profesional = await prisma.profesional.findUnique({ where: { id: profesionalId } });

    if (!servicio || !profesional) return res.status(400).json({ error: 'Datos inválidos (servicio o profesional no existe)' });

    const horaFin = format(addMinutes(parseTime(horaInicio), servicio.duracionMinutos), 'HH:mm');

    const nuevoTurno = await prisma.turno.create({
      data: {
        profesionalId: profesional.id,
        servicioId,
        fecha,
        horaInicio,
        horaFin,
        clienteNombre,
        clienteTelefono
      }
    });

    // TODO: Aquí se dispararía la lógica de WhatsApp (Webhook)
    console.log(`[NOTIFICACIÓN] Enviar mensaje a ${clienteTelefono} confirmando turno de ${servicio.nombre}`);

    res.status(201).json(nuevoTurno);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear el turno' });
  }
});

// Para sembrar datos iniciales usá el script standalone: `npm run seed`
// (ver seed_supabase.js). Se evita exponer un endpoint HTTP que borre la base.

app.get('/', (req, res) => {
  res.json({ status: 'API Online', version: '1.0.1' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

module.exports = app;
