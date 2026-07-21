const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Sembrando base de datos en Supabase...');
  
  // Limpiar datos previos si existen
  await prisma.turno.deleteMany();
  await prisma.servicio.deleteMany();
  await prisma.profesional.deleteMany();
  await prisma.configuracion.deleteMany();

  const hashedPassword = await bcrypt.hash('admin123', 10);

  // Crear equipo (1 dueño + 3 barberos)
  const barberos = [
    { nombre: 'Facundo', email: 'facundo@barberia.com', role: 'OWNER', horarioAtencionInicio: '09:00', horarioAtencionFin: '19:00', imagenUrl: '/barber_facundo.png', canEditServices: true },
    { nombre: 'Nico', email: 'nico@barberia.com', role: 'BARBER', horarioAtencionInicio: '09:00', horarioAtencionFin: '19:00', imagenUrl: '/barber_nico.png', canEditServices: false },
    { nombre: 'Mateo', email: 'mateo@barberia.com', role: 'BARBER', horarioAtencionInicio: '10:00', horarioAtencionFin: '20:00', imagenUrl: '/barber_mateo.png', canEditServices: false },
    { nombre: 'Santi', email: 'santi@barberia.com', role: 'BARBER', horarioAtencionInicio: '09:00', horarioAtencionFin: '18:00', imagenUrl: '/barber_santi.png', canEditServices: false },
  ];

  for (const b of barberos) {
    await prisma.profesional.create({ data: { ...b, passwordHash: hashedPassword } });
  }

  // Crear Servicios
  await prisma.servicio.createMany({
    data: [
      { nombre: 'Corte Clásico', duracionMinutos: 30, precio: 5000 },
      { nombre: 'Corte + Barba', duracionMinutos: 45, precio: 7500 },
      { nombre: 'Perfilado de Barba', duracionMinutos: 15, precio: 3000 },
      { nombre: 'Color y Decoloración', duracionMinutos: 120, precio: 15000 }
    ]
  });

  // Crear Configuración Global
  await prisma.configuracion.create({
    data: {
      id: 'global',
      nombreLocal: 'Estilo Cruz',
      logoUrl: '/logo.png',
      telefonoContacto: '+54 9 11 3414-1804',
      diasAbiertos: '1,2,3,4,5,6'
    }
  });

  console.log('✅ Base de datos lista en Supabase!');
  console.log('🔑 Usuario: facundo@barberia.com');
  console.log('🔑 Pass: admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
