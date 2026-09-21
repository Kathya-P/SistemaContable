import { useEffect, useState } from "react";
import CatalogoCuentas from "./components/CatalogoCuentas";
import Dashboard from "./components/Dashboard";
import GestionUsuarios from "./components/GestionUsuarios";
import LibroDiario from "./components/LibroDiario";
import LibroMayor from "./components/LibroMayor";
import KardexPage from "./components/KardexPage"; 
import Estadoresultados from "./components/Estadoresultados";  
import Login from "./components/Login";
import NuevoAsiento from "./components/NuevoAsiento";
import { supabase, supabaseConfigurado } from "./lib/supabase";
import { solicitarApi } from "./services/api";

const vistas = {
    inicio: "Inicio",
    dashboard: "Dashboard",
    cuentas: "Catálogo de cuentas",
    asiento: "Nuevo asiento",
    diario: "Libro Diario",
    mayor: "Libro Mayor",
    kardex: "Kardex",
    estadoResultados: "Estado de Resultados",
    usuarios: "Usuarios"
};

// qué permiso (de la tabla roles_permisos) necesita cada vista
const permisoDeVista = {
    cuentas: "puede_ver_catalogo",
    asiento: "puede_crear_asientos",
    diario: "puede_ver_reportes",
    mayor: "puede_ver_reportes",
    cuentasT: "puede_ver_reportes",
    estadoResultados: "puede_ver_reportes",
    usuarios: "puede_gestionar_usuarios"
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
                        <button className="button-secondary" onClick={() => cambiarVista("kardex")}>Ver Kardex</button>
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
                    <button className="panel-link" onClick={() => cambiarVista("kardex")}>Abrir Kardex de inventario</button>
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
    const [permisos, setPermisos] = useState({});

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

    // permisos del rol del usuario logueado (tabla roles_permisos)
    useEffect(() => {
        if(!usuario){
            return undefined;
        }

        let cancelado = false;

        solicitarApi("/permisos")
            .then(datos => {
                if(!cancelado){
                    setPermisos(datos || {});
                }
            })
            .catch(error => console.error("No se pudieron cargar los permisos:", error));

        return () => {
            cancelado = true;
        };
    }, [usuario]);

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
        setPermisos({});
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

    // una vista sin permiso asociado (como Inicio) es libre para todos
    const puede = permiso => !permiso || permisos[permiso] === true;

    function renderVista(){
        if(!puede(permisoDeVista[vista])){
            return <p className="message-error">No tienes permiso para ver esta sección.</p>;
        }

        if(vista === "dashboard") return <Dashboard cambiarVista={setVista} />;
        if(vista === "cuentas") return <CatalogoCuentas />;
        if(vista === "asiento") return <NuevoAsiento usuario={usuario} onCreated={() => setVista("diario")} />;
        if(vista === "diario") return <LibroDiario />;
        if(vista === "mayor") return <LibroMayor />;
        if(vista === "kardex") return <KardexPage />;
        if(vista === "estadoResultados") return <Estadoresultados />;
        if(vista === "usuarios") return <GestionUsuarios usuario={usuario} />;
        return <Inicio cambiarVista={setVista} />;
    }

    return(
        <div className={temaOscuro ? "app-shell tema-oscuro" : "app-shell"}>
            <header className="topbar">
                <button className="brand" onClick={() => setVista("inicio")}>
                    <span className="brand-mark">SC</span>
                    <span>ContaCabal</span>
                </button>
                <nav aria-label="Navegación principal">
                    {Object.entries(vistas)
                        .filter(([clave]) => puede(permisoDeVista[clave]))
                        .map(([clave, nombre]) => (
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