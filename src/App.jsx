import { useEffect, useState } from "react";
import CatalogoCuentas from "./components/CatalogoCuentas";
import LibroDiario from "./components/LibroDiario";
import LibroMayor from "./components/LibroMayor";
import CuentasT from "./components/Cuentas";
import Login from "./components/Login";
import NuevoAsiento from "./components/NuevoAsiento";
import { supabase, supabaseConfigurado } from "./lib/supabase";

const vistas = {
    inicio: "Inicio",
    cuentas: "Catálogo de cuentas",
    asiento: "Nuevo asiento",
    diario: "Libro Diario",
    mayor: "Libro Mayor",
    cuentasT: "Cuentas T"
};

function Inicio({ cambiarVista }){
    return(
        <section className="welcome-section">
            <div className="hero-layout">
                <div className="hero-copy">
                    <p className="eyebrow">Panel de gestión contable</p>
                    <h1>Controlá la información contable de tu empresa.</h1>
                    <p className="welcome-copy">Administrá el catálogo de cuentas, registrá partidas y consultá los movimientos desde un espacio centralizado.</p>
                    <div className="hero-actions">
                        <button className="button-primary" onClick={() => cambiarVista("asiento")}>Registrar asiento</button>
                        <button className="button-secondary" onClick={() => cambiarVista("diario")}>Ver Libro Diario</button>
                    </div>
                </div>

                <aside className="control-panel" aria-label="Resumen del sistema">
                    <div className="panel-heading">
                        <span>Resumen del sistema</span>
                        <span className="panel-period">Actual</span>
                    </div>
                    <div className="panel-ledger">
                        <div className="ledger-line"><span>Catálogo de cuentas</span><strong>Consultar</strong></div>
                        <div className="ledger-line"><span>Asientos contables</span><strong>Registrar</strong></div>
                        <div className="ledger-line"><span>Libro Diario</span><strong>Revisar</strong></div>
                    </div>
                    <button className="panel-link" onClick={() => cambiarVista("cuentas")}>Abrir catálogo de cuentas</button>
                </aside>
            </div>

            <div className="metrics-row">
                <div><strong>Catálogo</strong><span>Estructura contable</span></div>
                <div><strong>Asientos</strong><span>Registro de operaciones</span></div>
                <div><strong>Diario</strong><span>Consulta de movimientos</span></div>
            </div>
        </section>
    );
}

function App(){
    const [vista, setVista] = useState("inicio");
    const [temaOscuro, setTemaOscuro] = useState(() => localStorage.getItem("tema") === "oscuro");
    const [sesion, setSesion] = useState(null);
    const [cargandoSesion, setCargandoSesion] = useState(supabaseConfigurado);
    const [usuario, setUsuario] = useState(null);
    const [errorUsuario, setErrorUsuario] = useState("");

    useEffect(() => {
        if(!supabaseConfigurado){
            return undefined;
        }

        supabase.auth.getSession().then(({ data }) => {
            setSesion(data.session);
            setCargandoSesion(false);
        });

        const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
            setSesion(nuevaSesion);
        });

        return () => suscripcion.subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if(!sesion){
            return undefined;
        }

        let cancelado = false;

        async function cargarUsuario(){
            setErrorUsuario("");
            const { data: usuarioActual, error } = await supabase
                .from("usuarios")
                .select("id, nombre, rol, empresa_id, estado")
                .eq("auth_id", sesion.user.id)
                .eq("estado", true)
                .maybeSingle();

            if(cancelado){
                return;
            }

            if(error){
                setErrorUsuario(error.message || "No se pudo cargar tu usuario contable.");
                return;
            }

            if(!usuarioActual){
                setErrorUsuario("Tu usuario de Authentication todavía no está vinculado en public.usuarios. Ejecutá la migración auth_id y verificá que el correo coincida.");
                return;
            }

            setUsuario(usuarioActual);
        }

        cargarUsuario();

        return () => {
            cancelado = true;
        };
    }, [sesion]);

    function cambiarTema(){
        setTemaOscuro(temaActual => {
            const nuevoTema = !temaActual;
            localStorage.setItem("tema", nuevoTema ? "oscuro" : "claro");
            return nuevoTema;
        });
    }

    async function cerrarSesion() {
    await supabase.auth.signOut();
    setUsuario(null);
    setVista("inicio");
   }

    if(cargandoSesion){
        return <main className="login-page"><p>Cargando sesión...</p></main>;
    }

    if(!supabaseConfigurado){
        return <main className="login-page"><p className="message-error">Falta configurar la conexión con Supabase.</p></main>;
    }

    if(!sesion){
        return <Login />;
    }

    if(errorUsuario){
        return <main className="login-page"><p className="message-error">{errorUsuario}</p></main>;
    }

    if(!usuario){
        return <main className="login-page"><p>Cargando usuario contable...</p></main>;
    }

    function renderVista(){
        if(vista === "cuentas") return <CatalogoCuentas />;
        if(vista === "asiento") return <NuevoAsiento usuario={usuario} onCreated={() => setVista("diario")} />;
        if(vista === "diario") return <LibroDiario />;
        if(vista === "mayor") return <LibroMayor />;
        if(vista === "cuentasT") return <CuentasT />;  
        return <Inicio cambiarVista={setVista} />;
    }

    return(
        <div className={temaOscuro ? "app-shell tema-oscuro" : "app-shell"}>
            <header className="topbar">
                <button className="brand" onClick={() => setVista("inicio")}>
                    <span className="brand-mark">SC</span>
                    <span>Sistema Contable</span>
                </button>
                <nav aria-label="Navegación principal">
                    {Object.entries(vistas).map(([clave, nombre]) => (
                        <button key={clave} className={vista === clave ? "nav-link is-active" : "nav-link"} onClick={() => setVista(clave)}>{nombre}</button>
                    ))}
                    <button className="theme-toggle" onClick={cambiarTema} aria-label={temaOscuro ? "Activar modo claro" : "Activar modo oscuro"}>
                        <span aria-hidden="true">{temaOscuro ? "☼" : "☾"}</span>
                        {temaOscuro ? "Claro" : "Oscuro"}
                    </button>
                    <button className="logout-button" onClick={cerrarSesion}>Salir</button>
                </nav>
            </header>
            <main className="app-content">{renderVista()}</main>
        </div>
    );
}

export default App;