
        // Panel classes
        const panelClasses = {
            quienes: 'panel-quienes',
            soccer: 'panel-soccer',
            seguros: 'panel-seguros',
            vip: 'panel-vip',
            copa: 'panel-copa',
            fan: 'panel-fan',
            media: 'panel-media',
            socios: 'panel-socios',
            opiniones: 'panel-opiniones'
        };

        let currentSlide = 0;

        // All events data
        const allEvents = [
            { team1: 'América', team1Icon: '🦅', team2: 'Pumas', team2Icon: '🦁', date: '15 de Marzo, 2025', time: '8:00 PM', venue: 'Estadio Azteca, CDMX', badge: 'CLÁSICO', status: 'available' },
            { team1: 'América', team1Icon: '🦅', team2: 'Monterrey', team2Icon: '⭐', date: '22 de Marzo, 2025', time: '9:00 PM', venue: 'Estadio Azteca, CDMX', badge: 'ÚLTIMOS LUGARES', badgeClass: 'few-left', status: 'available' },
            { team1: 'Tigres', team1Icon: '🐯', team2: 'Pumas', team2Icon: '🦁', date: '5 de Abril, 2025', time: '7:00 PM', venue: 'Q2 Stadium, Austin, TX', badge: 'SOCCER iD CUP', status: 'available' },
            { team1: 'Chivas', team1Icon: '🐐', team2: 'Atlas', team2Icon: '🔴', date: '12 de Abril, 2025', time: '8:30 PM', venue: 'Estadio Akron, Guadalajara', badge: 'CLÁSICO TAPATÍO', status: 'available' },
            { team1: 'Cruz Azul', team1Icon: '🔵', team2: 'América', team2Icon: '🦅', date: '19 de Abril, 2025', time: '9:00 PM', venue: 'Estadio Azteca, CDMX', badge: 'CLÁSICO JOVEN', status: 'available' },
            { team1: 'Club América', team1Icon: '🦅', team2: 'Boca Juniors', team2Icon: '⚽', date: '22 de Junio, 2025', time: '8:00 PM', venue: 'Hard Rock Stadium, Miami, FL', badge: 'SOCCER iD CUP', status: 'available' },
            { team1: 'Tigres', team1Icon: '🐯', team2: 'Monterrey', team2Icon: '⭐', date: '3 de Mayo, 2025', time: '8:00 PM', venue: 'Estadio Universitario, MTY', badge: 'CLÁSICO REGIO', status: 'available' },
            { team1: 'León', team1Icon: '🦁', team2: 'Pachuca', team2Icon: '🏟️', date: '10 de Mayo, 2025', time: '7:00 PM', venue: 'Estadio León, GTO', badge: 'LIGA MX', status: 'available' },
            { team1: 'Santos', team1Icon: '⚪', team2: 'Toluca', team2Icon: '🔴', date: '17 de Mayo, 2025', time: '6:00 PM', venue: 'Estadio TSM Corona, Torreón', badge: 'LIGA MX', status: 'available' },
        ];

        // Compile template
        function compileTemplate(templateId) {
            const template = document.getElementById(`template-${templateId}`);
            return template ? template.innerHTML : '';
        }

        // Open panel
        function openPanel(panelId) {
            const mainContainer = document.getElementById('mainContainer');
            const detailPanel = document.getElementById('detailPanel');
            const detailContent = document.getElementById('detailContent');

            Object.values(panelClasses).forEach(cls => {
                detailPanel.classList.remove(cls);
            });

            detailPanel.classList.add(panelClasses[panelId]);
            const content = compileTemplate(panelId);
            detailContent.innerHTML = content;

            mainContainer.classList.add('slide-out');
            setTimeout(() => {
                detailPanel.classList.add('active');
            }, 100);

            document.body.style.overflow = 'hidden';
            currentSlide = 0;
        }

        // Close panel
        function closePanel() {
            const mainContainer = document.getElementById('mainContainer');
            const detailPanel = document.getElementById('detailPanel');

            detailPanel.classList.remove('active');
            setTimeout(() => {
                mainContainer.classList.remove('slide-out');
            }, 100);

            document.body.style.overflow = '';
        }

        // Testimonials slider
        function slideTestimonials(direction) {
            const track = document.getElementById('testimonialsTrack');
            if (!track) return;

            const cards = track.querySelectorAll('.testimonial-card');
            const cardWidth = cards[0].offsetWidth + 24;
            const maxSlide = cards.length - Math.floor(track.parentElement.offsetWidth / cardWidth);

            currentSlide += direction;
            currentSlide = Math.max(0, Math.min(currentSlide, maxSlide));

            track.style.transform = `translateX(-${currentSlide * cardWidth}px)`;
        }

        // Handle form submission
        function handleFormSubmit(event, formType) {
            event.preventDefault();
            
            const form = event.target;
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            const submitBtn = form.querySelector('.submit-btn');
            const originalText = submitBtn.innerHTML;
            
            submitBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                ¡Enviado con éxito!
            `;
            submitBtn.style.background = 'linear-gradient(135deg, #11998e, #38ef7d)';
            submitBtn.disabled = true;
            
            setTimeout(() => {
                form.reset();
                submitBtn.innerHTML = originalText;
                submitBtn.style.background = '';
                submitBtn.disabled = false;
            }, 3000);
            
            console.log(`Form ${formType} submitted:`, data);
        }

        // Contact for event via WhatsApp
        function contactForEvent(eventName) {
            const message = encodeURIComponent(`Hola SOCCER iD, me interesa obtener información sobre el evento: ${eventName}`);
            window.open(`https://wa.me/5215512345678?text=${message}`, '_blank');
        }

        // Open events modal
        function openEventsModal() {
            const modal = document.getElementById('eventsModal');
            const loading = document.getElementById('loadingContainer');
            const grid = document.getElementById('allEventsGrid');
            
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            loading.style.display = 'flex';
            grid.classList.remove('loaded');
            
            // Simulate loading
            setTimeout(() => {
                loading.style.display = 'none';
                renderAllEvents();
                grid.classList.add('loaded');
            }, 1500);
        }

        // Close events modal
        function closeEventsModal() {
            const modal = document.getElementById('eventsModal');
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }

        // Render all events
        function renderAllEvents() {
            const grid = document.getElementById('allEventsGrid');
            grid.innerHTML = allEvents.map(event => `
                <div class="event-card" onclick="contactForEvent('${event.team1} vs ${event.team2} - ${event.date}')">
                    <div class="event-image">
                        <img src="https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600" alt="${event.team1} vs ${event.team2}">
                        <span class="event-badge ${event.badgeClass || ''}">${event.badge}</span>
                    </div>
                    <div class="event-body">
                        <div class="event-date">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            ${event.date} • ${event.time}
                        </div>
                        <div class="event-teams">
                            <div class="event-team">
                                <div class="team-shield">${event.team1Icon}</div>
                                <div class="team-name">${event.team1}</div>
                            </div>
                            <span class="event-vs">VS</span>
                            <div class="event-team">
                                <div class="team-shield">${event.team2Icon}</div>
                                <div class="team-name">${event.team2}</div>
                            </div>
                        </div>
                        <div class="event-venue">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            ${event.venue}
                        </div>
                        <button class="event-cta">
                            Contactar Asesor
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            const bentoItems = document.querySelectorAll('.bento-item');

            bentoItems.forEach(item => {
                item.addEventListener('click', function() {
                    const panelId = this.dataset.panel;
                    if (panelId) {
                        openPanel(panelId);
                    }
                });
            });

            // Close on Escape
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    closePanel();
                    closeEventsModal();
                }
            });

            // Smooth scroll for anchor links
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function(e) {
                    const href = this.getAttribute('href');
                    if (href !== '#') {
                        e.preventDefault();
                        const target = document.querySelector(href);
                        if (target) {
                            target.scrollIntoView({ behavior: 'smooth' });
                        }
                    }
                });
            });
        });
    