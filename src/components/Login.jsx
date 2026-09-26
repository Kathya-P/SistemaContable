import { useState } from "react";
import { supabase } from "../lib/supabase";
import { registrarUsuario } from "../services/authService";

function Icono({ tipo }) {
    const props = {
        width: 15,
        height: 15,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        style: { color: "#1B4332", flexShrink: 0 },
        "aria-hidden": "true"
    };

    switch (tipo) {
        case "user":
            return (
                <svg {...props}>
                    <circle cx="12" cy="7" r="4" />
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                </svg>
            );
        case "empresa":
            return (
                <svg {...props}>
                    <rect x="4" y="2" width="16" height="20" rx="2" />
                    <path d="M9 22v-4h6v4" />
                    <path d="M8 6h.01" />
                    <path d="M16 6h.01" />
                    <path d="M8 10h.01" />
                    <path d="M16 10h.01" />
                    <path d="M8 14h.01" />
                    <path d="M16 14h.01" />
                </svg>
            );
        case "mail":
            return (
                <svg {...props}>
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
            );
        case "mail-check":
            return (
                <svg {...props}>
                    <path d="m9 11 3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
            );
        case "lock":
            return (
                <svg {...props}>
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
            );
        case "lock-check":
            return (
                <svg {...props}>
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    <circle cx="12" cy="16" r="1" />
                </svg>
            );
        default:
            return null;
    }
}

function LogoLogin() {
    const [errorImagen, setErrorImagen] = useState(false);

    return (
        <div className="login-brand-header">
            {!errorImagen ? (
                <img
                    src="/logo.png"
                    alt="ContaCabal"
                    style={{ maxHeight: "98px", maxWidth: "240px", objectFit: "contain", margin: "0 auto 12px", display: "block", objectPosition: "center" }}
                    onError={() => setErrorImagen(true)}
                />
            ) : (
                <div className="login-brand">
                    <span className="brand-mark">SC</span>
                    <span>ContaCabal</span>
                </div>
            )}
        </div>
    );
}

function FormularioIngreso(){
    const [correo, setCorreo] = useState("");
    const [contrasena, setContrasena] = useState("");
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState("");

    async function iniciarSesion(evento){
        evento.preventDefault();
        setError("");

        if(!correo.trim() || !contrasena){
            setError("Completa tu correo y contraseña.");
            return;
        }

        try{
            setCargando(true);
            if (supabase && supabase.auth) {
                const { error: errorSesion } = await supabase.auth.signInWithPassword({
                    email: correo.trim(),
                    password: contrasena
                });
                if(errorSesion){
                    throw errorSesion;
                }
            }
        }catch(errorSesion){
            setError(errorSesion.message || "Credenciales incorrectas o usuario no registrado.");
        }finally{
            setCargando(false);
        }
    }

    return(
        <form onSubmit={iniciarSesion} className="login-form">
            <label>
                <span className="field-label-text">
                    <Icono tipo="mail" />
                    <span>Correo electrónico</span>
                </span>
                <input
                    type="email"
                    value={correo}
                    onChange={evento => setCorreo(evento.target.value)}
                    autoComplete="email"
                    placeholder="correo@empresa.com"
                    required
                />
            </label>

            <label>
                <span className="field-label-text">
                    <Icono tipo="lock" />
                    <span>Contraseña</span>
                </span>
                <input
                    type="password"
                    value={contrasena}
                    onChange={evento => setContrasena(evento.target.value)}
                    autoComplete="current-password"
                    placeholder="Ingresa tu contraseña"
                    required
                />
            </label>

            {error && <p className="message-error">{error}</p>}

            <button type="submit" className="button-primary" disabled={cargando}>
                {cargando ? "Iniciando sesión..." : "Iniciar sesión"}
            </button>
        </form>
    );
}

function FormularioRegistro(){
    const [nombre, setNombre] = useState("");
    const [empresa, setEmpresa] = useState("");
    const [correo, setCorreo] = useState("");
    const [repiteCorreo, setRepiteCorreo] = useState("");
    const [password, setPassword] = useState("");
    const [confirmarPassword, setConfirmarPassword] = useState("");
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState("");
    const [exito, setExito] = useState("");

    async function registrar(evento){
        evento.preventDefault();
        setError("");
        setExito("");

        if(!nombre.trim() || !empresa.trim() || !correo.trim() || !password){
            setError("Completa todos los campos obligatorios.");
            return;
        }

        if(correo.trim().toLowerCase() !== repiteCorreo.trim().toLowerCase()){
            setError("Los correos no coinciden.");
            return;
        }

        if(password !== confirmarPassword){
            setError("Las contraseñas no coinciden.");
            return;
        }

        if(password.length < 6){
            setError("La contraseña debe tener al menos 6 caracteres.");
            return;
        }

        try{
            setCargando(true);
            await registrarUsuario({
                nombre: nombre.trim(),
                nombre_empresa: empresa.trim(),
                correo: correo.trim(),
                password
            });

            if (supabase && supabase.auth) {
                const { error: errorSesion } = await supabase.auth.signInWithPassword({
                    email: correo.trim(),
                    password
                });

                if(errorSesion){
                    setExito("Cuenta creada. Ahora podés iniciar sesión con tus credenciales.");
                }
            } else {
                setExito("Cuenta creada exitosamente. Ya podés iniciar sesión.");
            }
        }catch(errorRegistro){
            setError(errorRegistro.message || "No se pudo completar el registro.");
        }finally{
            setCargando(false);
        }
    }

    return(
        <form onSubmit={registrar} className="login-form login-form-grid">
            <label>
                <span className="field-label-text">
                    <Icono tipo="user" />
                    <span>Nombre completo</span>
                </span>
                <input
                    type="text"
                    value={nombre}
                    onChange={evento => setNombre(evento.target.value)}
                    autoComplete="name"
                    placeholder="Tu nombre y apellido"
                    required
                />
            </label>

            <label>
                <span className="field-label-text">
                    <Icono tipo="empresa" />
                    <span>Empresa</span>
                </span>
                <input
                    type="text"
                    value={empresa}
                    onChange={evento => setEmpresa(evento.target.value)}
                    placeholder="Nombre de tu empresa"
                    required
                />
            </label>

            <label>
                <span className="field-label-text">
                    <Icono tipo="mail" />
                    <span>Correo electrónico</span>
                </span>
                <input
                    type="email"
                    value={correo}
                    onChange={evento => setCorreo(evento.target.value)}
                    autoComplete="email"
                    placeholder="correo@empresa.com"
                    required
                />
            </label>

            <label>
                <span className="field-label-text">
                    <Icono tipo="mail-check" />
                    <span>Repite el correo</span>
                </span>
                <input
                    type="email"
                    value={repiteCorreo}
                    onChange={evento => setRepiteCorreo(evento.target.value)}
                    placeholder="correo@empresa.com"
                    required
                />
            </label>

            <label>
                <span className="field-label-text">
                    <Icono tipo="lock" />
                    <span>Contraseña</span>
                </span>
                <input
                    type="password"
                    value={password}
                    onChange={evento => setPassword(evento.target.value)}
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                    required
                />
            </label>

            <label>
                <span className="field-label-text">
                    <Icono tipo="lock-check" />
                    <span>Confirmar contraseña</span>
                </span>
                <input
                    type="password"
                    value={confirmarPassword}
                    onChange={evento => setConfirmarPassword(evento.target.value)}
                    autoComplete="new-password"
                    placeholder="Repite tu contraseña"
                    required
                />
            </label>

            {error && <p className="message-error login-full-span">{error}</p>}
            {exito && <p className="message-success login-full-span">{exito}</p>}

            <button type="submit" className="button-primary login-full-span" disabled={cargando}>
                {cargando ? "Registrando usuario..." : "Registrar usuario"}
            </button>
        </form>
    );
}

function Login(){
    const [pestana, setPestana] = useState("ingreso");

    return(
        <main className="login-page">
            <section className={`login-card ${pestana === "registro" ? "login-card-wide" : ""}`}>
                <LogoLogin />

                <p className="eyebrow">Acceso al sistema</p>
                <h1>{pestana === "ingreso" ? "Iniciar sesión" : "Crear cuenta"}</h1>
                <p className="login-copy">
                    {pestana === "ingreso"
                        ? "Ingresá con tus credenciales para administrar partidas, catálogos y reportes."
                        : "Registrá tu empresa y tu usuario para comenzar a operar."}
                </p>

                <div className="auth-tabs" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={pestana === "ingreso"}
                        className={pestana === "ingreso" ? "auth-tab is-active" : "auth-tab"}
                        onClick={() => setPestana("ingreso")}
                    >
                        Iniciar sesión
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={pestana === "registro"}
                        className={pestana === "registro" ? "auth-tab is-active" : "auth-tab"}
                        onClick={() => setPestana("registro")}
                    >
                        Crear cuenta
                    </button>
                </div>

                {pestana === "ingreso" ? (
                    <FormularioIngreso />
                ) : (
                    <FormularioRegistro />
                )}
            </section>
        </main>
    );
}

export default Login;
