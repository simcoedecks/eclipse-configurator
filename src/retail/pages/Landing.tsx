import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import {
  ArrowRight, Sun, Shield, Wrench, Sparkles, Wind, Thermometer,
  SlidersHorizontal, Smartphone, Phone, Mail, Check, Star, ChevronDown,
} from 'lucide-react';

/**
 * Eclipse Pergola — conversion landing page.
 *
 * URL: /design (campaign + organic landing). Can be promoted to the
 * homepage by swapping the "/" route in App.tsx to <Landing />.
 *
 * Primary CTA everywhere: "Design Your Pergola" → /configurator.
 * Secondary CTA: "Talk to us" → scrolls to the consultation band with
 * phone + email (and a consultation route into the configurator).
 *
 * Brand: luxury-black / luxury-gold, Outfit serif headlines, generous
 * whitespace, scroll-reveal motion. Designed to feel agency-grade, not
 * a developer wireframe.
 */

const PHONE = '289-855-2977';
const PHONE_HREF = 'tel:2898552977';
const EMAIL = 'info@eclipsepergola.ca';

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const goConfigure = () => navigate('/configurator');
  const scrollToContact = () => {
    document.getElementById('consultation')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-luxury-paper text-luxury-black font-sans overflow-x-hidden">
      {/* ───────────────── Nav ───────────────── */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          scrolled ? 'bg-luxury-paper/90 backdrop-blur-md border-b border-luxury-cream py-3' : 'py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <img
            src="/logo.png"
            alt="Eclipse Pergola"
            className={`object-contain transition-all duration-500 ${scrolled ? 'h-8' : 'h-9'} ${scrolled ? '' : 'brightness-0 invert drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]'}`}
          />
          <nav className="flex items-center gap-6">
            <button
              onClick={scrollToContact}
              className={`hidden sm:inline text-xs uppercase tracking-[0.2em] font-bold transition-colors ${
                scrolled ? 'text-luxury-black/60 hover:text-luxury-gold' : 'text-white/80 hover:text-luxury-gold'
              }`}
            >
              Talk to us
            </button>
            <button
              onClick={goConfigure}
              className="group inline-flex items-center gap-2 bg-luxury-gold text-luxury-black px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-luxury-gold/90 transition-all"
            >
              Design Yours
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </nav>
        </div>
      </header>

      {/* ───────────────── Hero ───────────────── */}
      <section className="relative min-h-screen flex items-center">
        <div className="absolute inset-0">
          <img src="/pergola.jpg" alt="Eclipse louvered pergola" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-luxury-black/85 via-luxury-black/55 to-luxury-black/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-luxury-black/70 via-transparent to-luxury-black/30" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 w-full pt-28 pb-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-2xl"
          >
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 border border-luxury-gold/40 rounded-full">
              <Star className="w-3 h-3 text-luxury-gold fill-luxury-gold" />
              <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-luxury-gold">Ontario's Premium Louvered Pergola</span>
            </div>
            <h1 className="font-serif text-white text-5xl md:text-7xl leading-[1.02] mb-6">
              Your backyard,<br />
              <span className="text-luxury-gold">reimagined.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 leading-relaxed mb-10 max-w-xl">
              Motorized louvered roofs, integrated screens, and smart control — engineered to extend your living space into every season. Design yours in minutes and see it in 3D.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={goConfigure}
                className="group inline-flex items-center gap-3 bg-luxury-gold text-luxury-black px-8 py-4 text-sm font-bold uppercase tracking-[0.2em] hover:bg-white transition-all duration-300"
              >
                Design Your Pergola
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={scrollToContact}
                className="inline-flex items-center gap-2 text-white border border-white/30 px-8 py-4 text-sm font-bold uppercase tracking-[0.2em] hover:border-luxury-gold hover:text-luxury-gold transition-all duration-300"
              >
                Talk to us
              </button>
            </div>
            <p className="mt-6 text-xs text-white/50 tracking-wide">Free instant quote · No account needed · 3D preview</p>
          </motion.div>
        </div>

        <motion.button
          onClick={() => document.getElementById('trust')?.scrollIntoView({ behavior: 'smooth' })}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 hover:text-luxury-gold transition-colors"
          aria-label="Scroll down"
        >
          <ChevronDown className="w-6 h-6 animate-bounce" />
        </motion.button>
      </section>

      {/* ───────────────── Trust bar ───────────────── */}
      <section id="trust" className="bg-luxury-black text-white py-8">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { icon: <Shield className="w-5 h-5" />, label: '10-Year Warranty', sub: 'Structure & coating' },
            { icon: <Wrench className="w-5 h-5" />, label: '6–8 Week Install', sub: 'From cleared deposit' },
            { icon: <Sun className="w-5 h-5" />, label: 'All-Season Comfort', sub: 'Rain or shine' },
            { icon: <Sparkles className="w-5 h-5" />, label: 'Bespoke Design', sub: 'Built to your space' },
          ].map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="flex items-center gap-3"
            >
              <div className="text-luxury-gold shrink-0">{t.icon}</div>
              <div>
                <p className="text-sm font-bold leading-tight">{t.label}</p>
                <p className="text-[11px] text-white/50">{t.sub}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ───────────────── Features ───────────────── */}
      <section className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal>
            <p className="text-[11px] uppercase tracking-[0.4em] font-bold text-luxury-gold mb-4 text-center">Engineered to impress</p>
            <h2 className="font-serif text-4xl md:text-5xl text-center text-luxury-black mb-4">Every detail, considered.</h2>
            <p className="text-center text-luxury-black/60 max-w-2xl mx-auto mb-16 text-lg">
              A pergola that works as hard as it looks. Open the roof for sun, close it for shade, drop the screens for privacy — all at the touch of a button.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { img: '/motorizedscreens.png', icon: <SlidersHorizontal className="w-5 h-5" />, title: 'Motorized Louvered Roof', desc: 'Adjust the louvers for perfect light and airflow. Closes watertight at the first drop of rain.' },
              { img: '/privacywall.png', icon: <Wind className="w-5 h-5" />, title: 'Integrated Screens & Walls', desc: 'Retractable screens and privacy walls turn an open frame into a sheltered room.' },
              { img: '/bromic-heater.jpg', icon: <Thermometer className="w-5 h-5" />, title: 'Heating & Lighting', desc: 'Bromic infrared heaters and integrated LED lighting extend your evenings well past sunset.' },
              { img: '/smart-app-control.jpg', icon: <Smartphone className="w-5 h-5" />, title: 'Smart App Control', desc: 'Control louvers, screens, lighting and heat from your phone. Wind & rain sensors automate the rest.' },
            ].map((f, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="group bg-white border border-luxury-cream overflow-hidden h-full flex flex-col transition-all duration-500 hover:shadow-[0_24px_60px_rgba(0,0,0,0.08)] hover:-translate-y-1.5">
                  <div className="aspect-[4/3] overflow-hidden bg-luxury-cream">
                    <img src={f.img} alt={f.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="w-9 h-9 rounded-lg bg-luxury-gold/15 text-luxury-gold flex items-center justify-center mb-4">{f.icon}</div>
                    <h3 className="font-serif text-xl text-luxury-black mb-2">{f.title}</h3>
                    <p className="text-sm text-luxury-black/60 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────── Split feature / configurator teaser ───────────────── */}
      <section className="bg-luxury-black text-white py-24 md:py-32 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <Reveal>
            <p className="text-[11px] uppercase tracking-[0.4em] font-bold text-luxury-gold mb-4">See it before you buy it</p>
            <h2 className="font-serif text-4xl md:text-5xl mb-6 leading-[1.05]">Design it in 3D.<br />Get your price instantly.</h2>
            <p className="text-white/70 text-lg leading-relaxed mb-8 max-w-lg">
              Our configurator lets you size your pergola, pick colours, add screens and upgrades, and watch it render in real time. No sales pressure, no waiting — your bespoke quote is ready the moment you're done.
            </p>
            <ul className="space-y-3 mb-10">
              {['Real-time 3D visualization', 'Transparent, itemized pricing', 'Instant proposal by email', 'Edit your design anytime'].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-white/85">
                  <span className="w-5 h-5 rounded-full bg-luxury-gold/20 text-luxury-gold flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3" />
                  </span>
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={goConfigure}
              className="group inline-flex items-center gap-3 bg-luxury-gold text-luxury-black px-8 py-4 text-sm font-bold uppercase tracking-[0.2em] hover:bg-white transition-all duration-300"
            >
              Start Designing
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="relative">
              <div className="absolute -inset-4 bg-luxury-gold/10 blur-3xl rounded-full" />
              <img
                src="/motorizedscreens.png"
                alt="Configure your pergola"
                className="relative rounded-2xl border border-white/10 shadow-2xl w-full object-cover aspect-[4/3]"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────── How it works ───────────────── */}
      <section className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal>
            <p className="text-[11px] uppercase tracking-[0.4em] font-bold text-luxury-gold mb-4 text-center">From idea to installed</p>
            <h2 className="font-serif text-4xl md:text-5xl text-center text-luxury-black mb-16">Three simple steps.</h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { n: '01', title: 'Design', desc: 'Use our 3D configurator to build your perfect pergola — size, colour, screens, and upgrades. Get an instant, transparent quote.' },
              { n: '02', title: 'Refine', desc: 'We review your design with you, confirm site details, and lock in the final specification and pricing.' },
              { n: '03', title: 'Install', desc: 'Our crew installs your bespoke pergola in 6–8 weeks, backed by our 10-year structural warranty.' },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 0.12}>
                <div className="relative">
                  <span className="font-serif text-7xl text-luxury-gold/15 absolute -top-6 -left-2 select-none">{s.n}</span>
                  <div className="relative pt-8">
                    <h3 className="font-serif text-2xl text-luxury-black mb-3">{s.title}</h3>
                    <p className="text-luxury-black/60 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────── Gallery ───────────────── */}
      <section className="pb-24 md:pb-32">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              <div className="md:col-span-2 md:row-span-2 overflow-hidden group">
                <img src="/pergola.jpg" alt="Installed pergola" className="w-full h-full object-cover aspect-[4/3] md:aspect-auto group-hover:scale-105 transition-transform duration-700" />
              </div>
              <div className="overflow-hidden group">
                <img src="/privacywall.png" alt="Privacy wall detail" className="w-full h-full object-cover aspect-square group-hover:scale-105 transition-transform duration-700" />
              </div>
              <div className="overflow-hidden group">
                <img src="/ceiling-fan.jpg" alt="Ceiling fan upgrade" className="w-full h-full object-cover aspect-square group-hover:scale-105 transition-transform duration-700" />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────── FAQ ───────────────── */}
      <section className="bg-luxury-cream/40 py-24 md:py-32">
        <div className="max-w-3xl mx-auto px-6">
          <Reveal>
            <p className="text-[11px] uppercase tracking-[0.4em] font-bold text-luxury-gold mb-4 text-center">Good to know</p>
            <h2 className="font-serif text-4xl md:text-5xl text-center text-luxury-black mb-14">Common questions.</h2>
          </Reveal>
          <div className="space-y-3">
            {[
              { q: 'How much does an Eclipse pergola cost?', a: 'Pricing depends on size, screens, and upgrades. The fastest way to a real number is our configurator — design yours and get an itemized quote in minutes, no obligation.' },
              { q: 'Are the louvers really waterproof?', a: 'Yes. When closed, the aluminum louvers seal to channel rain into integrated gutters and downspouts in the posts, keeping the space dry.' },
              { q: 'How long does installation take?', a: 'Most installations are complete within 6–8 weeks of a cleared deposit, depending on configuration and site readiness.' },
              { q: 'Do you serve my area?', a: 'We install across Ontario. Start a design or reach out and we\'ll confirm coverage for your address.' },
              { q: 'What warranty is included?', a: '10 years on the structure and powder coating, 5 years on motors and electronics.' },
            ].map((f, i) => (
              <Reveal key={i} delay={i * 0.06}>
                <FaqItem q={f.q} a={f.a} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────── Consultation / final CTA ───────────────── */}
      <section id="consultation" className="bg-luxury-black text-white py-24 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <img src="/pergola.jpg" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-luxury-black/70" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <Reveal>
            <h2 className="font-serif text-4xl md:text-6xl mb-6 leading-[1.05]">Ready to transform<br /><span className="text-luxury-gold">your space?</span></h2>
            <p className="text-white/70 text-lg max-w-xl mx-auto mb-10">
              Design your pergola in 3D for an instant quote, or talk to our team about your project — whatever works for you.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 mb-14">
              <button
                onClick={goConfigure}
                className="group inline-flex items-center gap-3 bg-luxury-gold text-luxury-black px-8 py-4 text-sm font-bold uppercase tracking-[0.2em] hover:bg-white transition-all duration-300"
              >
                Design Your Pergola
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href={`mailto:${EMAIL}?subject=Pergola%20Consultation%20Request&body=Hi%20Eclipse%20team%2C%20I%27d%20like%20to%20talk%20about%20a%20pergola%20for%20my%20space.`}
                className="inline-flex items-center gap-2 text-white border border-white/30 px-8 py-4 text-sm font-bold uppercase tracking-[0.2em] hover:border-luxury-gold hover:text-luxury-gold transition-all duration-300"
              >
                Request a Consultation
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 pt-10 border-t border-white/10">
              <a href={PHONE_HREF} className="group inline-flex items-center gap-3 text-white/80 hover:text-luxury-gold transition-colors">
                <span className="w-10 h-10 rounded-full border border-white/15 group-hover:border-luxury-gold flex items-center justify-center transition-colors">
                  <Phone className="w-4 h-4" />
                </span>
                <span className="text-left">
                  <span className="block text-[10px] uppercase tracking-[0.2em] text-white/40">Call us</span>
                  <span className="text-base font-semibold">{PHONE}</span>
                </span>
              </a>
              <a href={`mailto:${EMAIL}?subject=Pergola%20Consultation`} className="group inline-flex items-center gap-3 text-white/80 hover:text-luxury-gold transition-colors">
                <span className="w-10 h-10 rounded-full border border-white/15 group-hover:border-luxury-gold flex items-center justify-center transition-colors">
                  <Mail className="w-4 h-4" />
                </span>
                <span className="text-left">
                  <span className="block text-[10px] uppercase tracking-[0.2em] text-white/40">Email us</span>
                  <span className="text-base font-semibold">{EMAIL}</span>
                </span>
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────── Footer ───────────────── */}
      <footer className="bg-luxury-black text-white/40 border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Eclipse Pergola" className="h-7 object-contain brightness-0 invert opacity-60" />
            <span className="text-[11px]">© {new Date().getFullYear()} Eclipse Pergola Inc.</span>
          </div>
          <div className="flex items-center gap-6 text-[11px]">
            <a href={PHONE_HREF} className="hover:text-luxury-gold">{PHONE}</a>
            <a href={`mailto:${EMAIL}`} className="hover:text-luxury-gold">{EMAIL}</a>
            <button onClick={goConfigure} className="hover:text-luxury-gold uppercase tracking-widest font-bold">Design Yours</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ───────────────── Helpers ───────────────── */

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-luxury-cream">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="font-serif text-lg text-luxury-black">{q}</span>
        <ChevronDown className={`w-5 h-5 text-luxury-gold shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <p className="px-6 pb-5 text-luxury-black/60 leading-relaxed">{a}</p>
      </motion.div>
    </div>
  );
}
