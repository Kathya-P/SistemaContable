import { useEffect, useState } from "react";
import CatalogoCuentas from "./components/CatalogoCuentas";
import Dashboard from "./components/Dashboard";
import GestionUsuarios from "./components/Gestionusuarios";
import LibroDiario from "./components/LibroDiario";
import LibroMayor from "./components/LibroMayor";
import KardexPage from "./components/KardexPage"; 
import Estadoresultados from "./components/Estadoresultados"; 
import BalanceGeneral from "./components/BalanceGeneral";
import RatiosFinancieros from "./components/RatiosFinancieros";
import TablaComparativa from "./components/TablaComparativa";
import Login from "./components/Login";
import NuevoAsiento from "./components/NuevoAsiento";
import AuditoriaPage from "./components/AuditoriaPage";
import Sidebar from "./components/Sidebar";
import { supabase, supabaseConfigurado } from "./lib/supabase";
import { solicitarApi } from "./services/api";

// estructura del menú lateral (grupos colapsables)
const menuLateral = [
    { id: "dashboard", clave: "dashboard", nombre: "Dashboard", icono: "dashboard" },
    {
        id: "contabilidad", nombre: "Contabilidad", icono: "contabilidad",
        items: [
            { clave: "cuentas", nombre: "Catálogo de cuentas" },
            { clave: "asiento", nombre: "Nuevo asiento" },
            { clave: "diario", nombre: "Libro Diario" },
            { clave: "mayor", nombre: "Libro Mayor" }
        ]
    },
    {
        id: "inventario", nombre: "Inventario", icono: "inventario",
        items: [{ clave: "kardex", nombre: "Kardex" }]
    },
    {
        id: "reportes", nombre: "Reportes", icono: "reportes",
        items: [
            { clave: "estadoResultados", nombre: "Estado de Resultados" },
            { clave: "balanceGeneral", nombre: "Balance General" }
        ]
    },
    {
        id: "herramientas", nombre: "Herramientas", icono: "herramientas",
        items: [
            { clave: "tablaComparativa", nombre: "Tabla Comparativa" },
            { clave: "ratiosFinancieros", nombre: "Ratios Financieros" }
        ]
    },
    {
        id: "administracion", nombre: "Administración", icono: "administracion",
        items: [
            { clave: "usuarios", nombre: "Usuarios" },
            { clave: "auditoria", nombre: "Auditoría" }
        ]
    }
];

// qué permiso (de la tabla roles_permisos) necesita cada vista
const permisoDeVista = {
    cuentas: "puede_ver_catalogo",
    asiento: "puede_crear_asientos",
    diario: "puede_ver_reportes",
    mayor: "puede_ver_reportes",
    cuentasT: "puede_ver_reportes",
    estadoResultados: "puede_ver_reportes",
    balanceGeneral: "puede_ver_reportes",
    ratiosFinancieros: "puede_ver_reportes",
    tablaComparativa: "puede_ver_reportes",
    usuarios: "puede_gestionar_usuarios",
    auditoria: "puede_gestionar_usuarios"
};

const PERMISOS_PREDETERMINADOS = {
    puede_ver_catalogo: true,
    puede_crear_asientos: true,
    puede_ver_reportes: true,
    puede_gestionar_usuarios: false
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
    const [menuColapsado, setMenuColapsado] = useState(() => localStorage.getItem("menu") === "colapsado");
    const [sesion, setSesion] = useState(() =>
        !supabaseConfigurado ? { user: { id: "demo-user", email: "admin@contacabal.com" } } : null
    );
    const [cargandoSesion, setCargandoSesion] = useState(supabaseConfigurado);
    const [usuario, setUsuario] = useState(() =>
        !supabaseConfigurado ? { id: 1, nombre: "Contador Principal", rol: "ADMIN", empresa_id: 1, estado: true } : null
    );
    const [empresaActual, setEmpresaActual] = useState(() =>
        !supabaseConfigurado ? { nombre_empresa: "Empresa demo" } : null
    );
    const [errorUsuario, setErrorUsuario] = useState("");
    const [permisos, setPermisos] = useState(() =>
        !supabaseConfigurado ? PERMISOS_PREDETERMINADOS : {}
    );

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
        if(!sesion || sesion.esDemo){
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
                if(!cancelado && datos && Object.keys(datos).length > 0){
                    setPermisos(datos);
                }
            })
            .catch(error => {
                console.error("No se pudieron cargar los permisos:", error);
                if(!cancelado){
                    setPermisos(PERMISOS_PREDETERMINADOS);
                }
            });

        return () => {
            cancelado = true;
        };
    }, [usuario]);

    useEffect(() => {
        if(!usuario){
            return undefined;
        }

        let cancelado = false;
        solicitarApi("/empresas")
            .then(empresas => {
                if(!cancelado){
                    setEmpresaActual((empresas || [])[0] || null);
                }
            })
            .catch(error => console.error("No se pudo cargar la empresa:", error));

        return () => { cancelado = true; };
    }, [usuario]);

    function cambiarTema(){
        setTemaOscuro(temaActual => {
            const nuevoTema = !temaActual;
            localStorage.setItem("tema", nuevoTema ? "oscuro" : "claro");
            return nuevoTema;
        });
    }

    function alternarColapso(){
        setMenuColapsado(estado => {
            const nuevo = !estado;
            localStorage.setItem("menu", nuevo ? "colapsado" : "expandido");
            return nuevo;
        });
    }

    async function cerrarSesion() {
        localStorage.removeItem("conta_demo_user_id");
        if(supabase){
            try { await supabase.auth.signOut(); } catch {
                // Ignorar error al cerrar sesión
            }
        }
        setUsuario(null);
        setEmpresaActual(null);
        setSesion(null);
        setPermisos({});
        setVista("inicio");
    }

    if(cargandoSesion){
        return <main className="login-page"><p>Cargando sesión...</p></main>;
    }

    if(supabaseConfigurado && !sesion){
        return <Login />;
    }

    if(errorUsuario){
        return <main className="login-page"><p className="message-error">{errorUsuario}</p></main>;
    }

    if(!usuario){
        return <main className="login-page"><p>Cargando usuario contable...</p></main>;
    }

    // Permite el acceso total si es ADMIN o CONTADOR, o si tiene el permiso asignado
    const puede = permiso => {
        if (!permiso) return true;
        if (!usuario) return false;
        if (usuario.rol === "ADMIN" || usuario.rol === "CONTADOR" || usuario.rol === "admin") return true;
        if (permisos && permisos[permiso] === true) return true;
        if (permiso === "puede_ver_reportes" || permiso === "puede_ver_catalogo") return true;
        return false;
    };

    function renderVista(){
        if(!puede(permisoDeVista[vista])){
            return <p className="message-error">No tienes permiso para ver esta sección.</p>;
        }

        const empresaNombre = empresaActual?.nombre_empresa || "Empresa";
        if(vista === "dashboard") return <Dashboard cambiarVista={setVista} empresaNombre={empresaNombre} />;
        if(vista === "cuentas") return <CatalogoCuentas usuario={usuario} empresaNombre={empresaNombre} />;
        if(vista === "asiento") return <NuevoAsiento usuario={usuario} empresaNombre={empresaNombre} onCreated={() => setVista("diario")} />;
        if(vista === "diario") return <LibroDiario empresaNombre={empresaNombre} />;
        if(vista === "mayor") return <LibroMayor empresaNombre={empresaNombre} />;
        if(vista === "kardex") return <KardexPage empresaNombre={empresaNombre} />;
        if(vista === "estadoResultados") return <Estadoresultados empresaNombre={empresaNombre} />;
        if(vista === "balanceGeneral") return <BalanceGeneral empresa={{ id: usuario.empresa_id }} empresaNombre={empresaNombre} />;
        if(vista === "ratiosFinancieros") return <RatiosFinancieros empresaNombre={empresaNombre} />;
        if(vista === "tablaComparativa") return <TablaComparativa usuario={usuario} empresaNombre={empresaNombre} />;
        if(vista === "usuarios") return <GestionUsuarios usuario={usuario} empresaNombre={empresaNombre} />;
        if(vista === "auditoria") return <AuditoriaPage usuario={usuario} empresaNombre={empresaNombre} />;
        return <Inicio cambiarVista={setVista} />;
    }

    // filtra grupos e items según los permisos del usuario
    const menuVisible = menuLateral
        .map(grupo => {
            if(!grupo.items){
                return puede(permisoDeVista[grupo.clave]) ? grupo : null;
            }
            const items = grupo.items.filter(item => puede(permisoDeVista[item.clave]));
            return items.length ? { ...grupo, items } : null;
        })
        .filter(Boolean);

    const clasesShell = ["app-shell"];
    if(temaOscuro) clasesShell.push("tema-oscuro");
    if(menuColapsado) clasesShell.push("sidebar-collapsed");

    return(
        <div className={clasesShell.join(" ")}>
            <Sidebar
                vista={vista}
                cambiarVista={setVista}
                grupos={menuVisible}
                colapsado={menuColapsado}
                alternarColapso={alternarColapso}
                temaOscuro={temaOscuro}
                cambiarTema={cambiarTema}
                usuario={usuario}
                cerrarSesion={cerrarSesion}
            />
            <div className="app-main">
                <main className="app-content">{renderVista()}</main>
            </div>
        </div>
    );
}

export default App;
