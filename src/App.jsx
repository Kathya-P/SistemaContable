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
    kardex: "puede_ver_reportes",
    estadoResultados: "puede_ver_reportes",
    balanceGeneral: "puede_ver_reportes",
    ratiosFinancieros: "puede_ver_reportes",
    tablaComparativa: "puede_ver_reportes",
    usuarios: "puede_gestionar_usuarios",
    auditoria: "puede_gestionar_usuarios"
};

// Matriz oficial de permisos por rol:
// | Rol       | Catálogo | Registrar asientos | Contabilizar | Anular | Reportes | Usuarios |
// | ADMIN     | Sí       | Sí                 | Sí           | Sí     | Sí       | Sí       |
// | CONTADOR  | Sí       | Sí                 | Sí           | Sí     | Sí       | No       |
// | AUXILIAR  | Sí       | Sí                 | No           | No     | Sí       | No       |
const PERMISOS_DEFAULT_POR_ROL = {
    ADMIN: {
        puede_ver_catalogo: true,
        puede_editar_catalogo: true,
        puede_crear_asientos: true,
        puede_contabilizar: true,
        puede_anular_asientos: true,
        puede_ver_reportes: true,
        puede_gestionar_usuarios: true
    },
    CONTADOR: {
        puede_ver_catalogo: true,
        puede_editar_catalogo: true,
        puede_crear_asientos: true,
        puede_contabilizar: true,
        puede_anular_asientos: true,
        puede_ver_reportes: true,
        puede_gestionar_usuarios: false
    },
    AUXILIAR: {
        puede_ver_catalogo: true,
        puede_editar_catalogo: false,
        puede_crear_asientos: true,
        puede_contabilizar: false,
        puede_anular_asientos: false,
        puede_ver_reportes: true,
        puede_gestionar_usuarios: false
    }
};

const PERMISOS_PREDETERMINADOS = PERMISOS_DEFAULT_POR_ROL.ADMIN;

function App(){
    const [vista, setVista] = useState("dashboard");
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
        setVista("dashboard");
    }

    useEffect(() => {
        if (usuario?.rol) {
            localStorage.setItem("conta_user_rol", String(usuario.rol).toUpperCase());
            if (usuario.id) {
                localStorage.setItem("conta_user_id", String(usuario.id));
            }
        }
    }, [usuario]);

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

    // Valida permisos según la matriz oficial:
    // | Rol       | Catálogo | Registrar asientos | Contabilizar | Anular | Reportes | Usuarios |
    // | ADMIN     | Sí       | Sí                 | Sí           | Sí     | Sí       | Sí       |
    // | CONTADOR  | Sí       | Sí                 | Sí           | Sí     | Sí       | No       |
    // | AUXILIAR  | Sí       | Sí                 | No           | No     | Sí       | No       |
    const puede = permiso => {
        if (!permiso) return true;
        if (!usuario) return false;
        const rol = String(usuario.rol || "AUXILIAR").toUpperCase();
        const matriz = PERMISOS_DEFAULT_POR_ROL[rol] || PERMISOS_DEFAULT_POR_ROL.AUXILIAR;

        // Regla inviolable: si la matriz oficial deniega el permiso para el rol, retornar false
        if (matriz[permiso] === false) {
            return false;
        }

        // Si la matriz oficial lo aprueba explícitamente, verificar si hay revocación en permisos dinámicos
        if (matriz[permiso] === true) {
            if (permisos && permisos[permiso] === false) return false;
            return true;
        }

        if (permisos && permisos[permiso] !== undefined) {
            return Boolean(permisos[permiso]);
        }
        return false;
    };

    function renderVista(){
        if(!puede(permisoDeVista[vista])){
            return (
                <div style={{ maxWidth: "580px", margin: "40px auto", padding: "28px", background: "var(--color-tarjeta, #ffffff)", border: "1px solid #fca5a5", borderRadius: "12px", textAlign: "center", boxShadow: "0 4px 12px rgba(220, 38, 38, 0.08)" }}>
                    <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#fee2e2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "24px" }}>
                        ✕
                    </div>
                    <h2 style={{ color: "#991b1b", margin: "0 0 10px 0", fontSize: "20px" }}>Acceso no autorizado</h2>
                    <p style={{ margin: "0 0 18px 0", color: "#475569", fontSize: "14px", lineHeight: "1.5" }}>
                        Tu rol actual es <strong>{usuario?.rol}</strong>. Según la matriz oficial de roles del sistema, este módulo solo está disponible para usuarios autorizados.
                    </p>
                    <button type="button" className="btn-hero-primary" onClick={() => setVista("dashboard")}>
                        Volver al Dashboard
                    </button>
                </div>
            );
        }

        const empresaNombre = empresaActual?.nombre_empresa || "Empresa";
        if(vista === "dashboard") return <Dashboard cambiarVista={setVista} usuario={usuario} empresaNombre={empresaNombre} />;
        if(vista === "cuentas") return <CatalogoCuentas usuario={usuario} empresaNombre={empresaNombre} />;
        if(vista === "asiento") return <NuevoAsiento usuario={usuario} empresaNombre={empresaNombre} onCreated={() => setVista("diario")} />;
        if(vista === "diario") return <LibroDiario empresaNombre={empresaNombre} usuario={usuario} />;
        if(vista === "mayor") return <LibroMayor empresaNombre={empresaNombre} />;
        if(vista === "kardex") return <KardexPage empresaNombre={empresaNombre} />;
        if(vista === "estadoResultados") return <Estadoresultados empresaNombre={empresaNombre} />;
        if(vista === "balanceGeneral") return <BalanceGeneral empresa={{ id: usuario.empresa_id }} empresaNombre={empresaNombre} />;
        if(vista === "ratiosFinancieros") return <RatiosFinancieros empresaNombre={empresaNombre} />;
        if(vista === "tablaComparativa") return <TablaComparativa usuario={usuario} empresaNombre={empresaNombre} />;
        if(vista === "usuarios") return <GestionUsuarios usuario={usuario} empresaNombre={empresaNombre} />;
        if(vista === "auditoria") return <AuditoriaPage usuario={usuario} empresaNombre={empresaNombre} />;
        return <Dashboard cambiarVista={setVista} usuario={usuario} empresaNombre={empresaNombre} />;
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
