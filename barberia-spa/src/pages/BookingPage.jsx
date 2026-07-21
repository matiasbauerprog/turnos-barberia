import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { DaySelector } from '../components/DaySelector';
import { ServiceSelector } from '../components/ServiceSelector';
import { BarberSelector } from '../components/BarberSelector';
import { TimeSelector } from '../components/TimeSelector';
import { ShopBackground } from '../components/ShopBackground';
import { api } from '../services/api';
import { X } from 'lucide-react';
import { calculateAvailableSlots } from '../utils/timeUtils';
import { mockServices, mockProfesionales, mockTurnosOcupados } from '../data/mockData';

export function BookingPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [services, setServices] = useState(mockServices);
  const [barbers, setBarbers] = useState(mockProfesionales);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
  const [isBooking, setIsBooking] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [phoneStep, setPhoneStep] = useState(0); // 0: Enter phone, 1: Confirm known name, 2: Enter new name
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [config, setConfig] = useState({ nombreLocal: 'Estilo Cruz', logoUrl: '/logo.png', telefonoContacto: '' });

  const handleCheckPhone = async () => {
    if (clientPhone.length < 6) return;
    setIsCheckingPhone(true);
    const name = await api.checkClientByPhone(`15${clientPhone}`);
    setIsCheckingPhone(false);

    if (name) {
      setClientName(name);
      setPhoneStep(1); // Confirm known name
    } else {
      setClientName('');
      setPhoneStep(2); // Enter new name
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const servicesData = await api.getServices();
        if (servicesData && servicesData.length > 0) setServices(servicesData);

        const barbersData = await api.getProfessionals();
        if (barbersData && barbersData.length > 0) setBarbers(barbersData);

        const configData = await api.getConfig();
        if (configData) {
          setConfig(configData);
          document.title = configData.nombreLocal;
        }
      } catch (err) {
        console.warn("Using mock data.");
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (config.nombreLocal) {
      document.title = config.nombreLocal;
    }
  }, [config.nombreLocal]);

  useEffect(() => {
    if (!selectedDate || !selectedService || !selectedBarber) {
      setAvailableSlots([]);
      return;
    }

    const fetchSlots = async () => {
      try {
        const fechaStr = format(selectedDate, 'yyyy-MM-dd');
        const data = await api.fetchAvailability(fechaStr, selectedService.id, selectedBarber.id);
        setAvailableSlots(data.slots);
      } catch (err) {
        console.warn("Falling back to local calculation.");
        const fechaStr = format(selectedDate, 'yyyy-MM-dd');
        const turnosDelDia = mockTurnosOcupados.filter(t => t.fecha === fechaStr && (t.profesional_id === selectedBarber.id || t.profesionalId === selectedBarber.id));

        const slots = calculateAvailableSlots(
          selectedBarber.horario_atencion || { inicio: selectedBarber.horarioAtencionInicio, fin: selectedBarber.horarioAtencionFin },
          turnosDelDia,
          selectedService.duracion_minutos || selectedService.duracionMinutos
        );
        setAvailableSlots(slots);
      }
    };
    fetchSlots();
  }, [selectedDate, selectedService, selectedBarber]);

  const handleConfirm = async () => {
    if (!selectedDate || !selectedService || !selectedTimeSlot || !clientName || !clientPhone) {
      alert("Por favor, completa tu nombre y teléfono para reservar.");
      return;
    }

    setIsBooking(true);
    try {
      await api.createTurno({
        servicioId: selectedService.id,
        profesionalId: selectedBarber.id,
        fecha: format(selectedDate, 'yyyy-MM-dd'),
        horaInicio: selectedTimeSlot,
        clienteNombre: clientName,
        clienteTelefono: `15${clientPhone}`
      });
      alert(`¡Turno reservado con éxito!\nTe esperamos el ${format(selectedDate, 'dd/MM/yyyy')} a las ${selectedTimeSlot}.`);
      setSelectedTimeSlot(null);
      const updated = await api.fetchAvailability(format(selectedDate, 'yyyy-MM-dd'), selectedService.id, selectedBarber.id);
      setAvailableSlots(updated.slots);
    } catch (err) {
      alert("Error al reservar el turno.");
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden flex flex-col justify-between items-center">
      <ShopBackground />

      <div className="flex-1 w-full flex flex-col items-center justify-center p-4 md:p-8 pt-12 md:pt-16 pb-16">
        <div className="w-full max-w-md md:max-w-lg relative z-10 bg-white/95 backdrop-blur-md shadow-2xl rounded-3xl p-4 md:p-6 border-[6px] border-brand-dark">
          <header className="mb-6 text-center flex flex-col items-center relative">
            <Link
              to="/admin"
              className="absolute top-0 right-0 text-[10px] font-black uppercase tracking-widest text-brand-dark/30 hover:text-brand-orange transition-colors"
              title="Acceso Personal"
            >
              🔐 Panel
            </Link>

            <div className="mb-2 -mt-12 bg-white rounded-full p-2 border-4 border-brand-purple shadow-lg">
              <img src={config.logoUrl} alt={config.nombreLocal} className="w-16 h-16 md:w-20 md:h-20 object-contain rounded-full" />
            </div>
            <h1 className="text-3xl md:text-4xl text-brand-dark uppercase tracking-tighter mb-0 mt-1">{config.nombreLocal}</h1>
            <p className="text-brand-orange font-black text-xs md:text-sm tracking-[0.3em] uppercase opacity-90">Barbería</p>
          </header>

          <main className="space-y-4">
            <DaySelector
              selectedDate={selectedDate}
              diasAbiertos={config.diasAbiertos}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setSelectedTimeSlot(null);
              }}
            />

            <ServiceSelector
              services={services}
              selectedService={selectedService}
              onSelectService={(service) => {
                setSelectedService(service);
                setSelectedBarber(null);
                setSelectedTimeSlot(null);
                setPhoneStep(0);
              }}
            />

            {selectedService && (
              <BarberSelector
                barbers={barbers}
                selectedBarber={selectedBarber}
                onSelectBarber={(barber) => {
                  setSelectedBarber(barber);
                  setSelectedTimeSlot(null);
                }}
              />
            )}

            {selectedBarber && (
              <TimeSelector
                availableSlots={availableSlots}
                selectedSlot={selectedTimeSlot}
                onSelectSlot={setSelectedTimeSlot}
              />
            )}

            {selectedTimeSlot && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up">
                <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative">
                  {/* Close Button */}
                  <button
                    onClick={() => { setSelectedTimeSlot(null); setPhoneStep(0); setIsCheckingPhone(false); }}
                    className="absolute p-2 transition-colors bg-white rounded-full shadow-md top-3 right-3 text-brand-dark/50 hover:text-brand-dark hover:bg-gray-100 z-10"
                  >
                    <X size={20} />
                  </button>

                  {/* Header */}
                  <div className="bg-brand-orange/10 p-5 border-b border-brand-orange/20 text-center">
                    <h2 className="font-black text-lg text-brand-dark uppercase tracking-widest">Confirma Tu Turno</h2>
                    <p className="text-xs font-bold text-brand-dark/60 mt-1">
                      Has elegido el {format(selectedDate, 'dd/MM/yyyy')} a las {selectedTimeSlot}
                    </p>
                  </div>

                  <div className="p-6 space-y-4">
                    {phoneStep === 0 && (
                      <div className="animate-fade-in-up">
                        <label htmlFor="cliente-telefono" className="block text-xs font-bold text-brand-dark/70 mb-2 text-center">
                          Tu número de celular
                        </label>
                        <div className="flex relative items-center">
                          <span className="inline-flex items-center px-4 py-3 rounded-l-xl border-2 border-r-0 border-brand-dark/10 bg-gray-50 text-gray-500 font-bold text-sm h-[48px] box-border leading-none">
                            15 -
                          </span>
                          <input
                            id="cliente-telefono"
                            name="telefono"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel-national"
                            placeholder="Ej: 55555555"
                            className="w-full h-[48px] box-border bg-white border-2 border-brand-dark/10 rounded-r-xl px-4 py-3 focus:outline-none focus:border-brand-orange font-bold text-sm"
                            value={clientPhone}
                            onChange={(e) => setClientPhone(e.target.value.replace(/\D/g, ''))}
                          />
                        </div>

                        <button
                          onClick={handleCheckPhone}
                          disabled={clientPhone.length < 6 || isCheckingPhone}
                          className={`w-full py-3 mt-4 text-sm font-black rounded-xl transition-all uppercase tracking-widest
                          ${(clientPhone.length < 6 || isCheckingPhone)
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-brand-orange text-white hover:opacity-90 active:scale-95'}
                        `}
                        >
                          {isCheckingPhone ? 'Buscando...' : 'Siguiente'}
                        </button>
                      </div>
                    )}

                    {phoneStep === 1 && (
                      <div className="text-center space-y-4 animate-fade-in-up">
                        <p className="text-sm font-bold text-brand-dark bg-brand-orange/10 p-4 rounded-xl border border-brand-orange/30">
                          Hola <strong>{clientName}</strong>, ¿Reservamos?
                        </p>
                        <button
                          onClick={handleConfirm}
                          disabled={isBooking}
                          className={`w-full py-4 text-xl font-black rounded-2xl transition-all font-display uppercase tracking-widest
                          ${isBooking
                              ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                              : 'bg-brand-dark text-brand-light shadow-[0_6px_0_0_#372673] hover:shadow-[0_4px_0_0_#372673] hover:translate-y-1 active:shadow-none active:translate-y-2'}
                        `}
                        >
                          {isBooking ? 'Reservando...' : 'Confirmar Turno'}
                        </button>
                        <button
                          onClick={() => setPhoneStep(2)}
                          className="text-xs font-bold text-brand-dark/60 underline hover:text-brand-orange transition-colors"
                        >
                          Soy otra persona
                        </button>
                      </div>
                    )}

                    {phoneStep === 2 && (
                      <div className="space-y-4 animate-fade-in-up">
                        <label htmlFor="cliente-nombre" className="block text-xs text-brand-dark/70 text-center font-bold px-2">
                          Por favor, introduce tu nombre completo
                        </label>
                        <input
                          id="cliente-nombre"
                          name="nombre"
                          type="text"
                          autoComplete="name"
                          placeholder="Nombre y Apellido"
                          className="w-full bg-white border-2 border-brand-dark/10 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-orange font-bold text-sm text-center"
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                        />

                        <button
                          onClick={handleConfirm}
                          disabled={isBooking || !clientName}
                          className={`w-full py-4 text-xl font-black rounded-2xl transition-all font-display uppercase tracking-widest
                          ${(isBooking || !clientName)
                              ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                              : 'bg-brand-dark text-brand-light shadow-[0_6px_0_0_#372673] hover:shadow-[0_4px_0_0_#372673] hover:translate-y-1 active:shadow-none active:translate-y-2'}
                        `}
                        >
                          {isBooking ? 'Reservando...' : 'Confirmar Turno'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      <footer className="w-full bg-white py-4 border-t border-brand-dark/5 mt-auto flex justify-center z-20">
        <a
          href="https://www.commandsoluciones.com.ar"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 group transition-all"
        >
          <span className="text-[7px] font-black text-brand-dark/40 uppercase tracking-[0.4em] italic pt-1">Un producto de</span>
          <img
            src="/logo-command.png"
            alt="Command Soluciones Logo"
            className="h-7 w-auto object-contain transition-all"
          />
        </a>
      </footer>
    </div>
  );
}
