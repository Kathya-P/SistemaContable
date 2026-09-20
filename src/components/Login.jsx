import { useState } from "react";
import { supabase } from "../lib/supabase";
import { registrarUsuario } from "../services/authService";

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
            const { error: errorSesion } = await supabase.auth.signInWithPassword({
                email: correo.trim(),
                password: contrasena
            });

            if(errorSesion){
                throw errorSesion;
            }
        }catch(errorSesion){
            setError(errorSesion.message || "No se pudo iniciar sesión.");
        }finally{
            setCargando(false);
        }
    }

    return(
        <form onSubmit={iniciarSesion} className="login-form">
            <label>Correo electrónico
                <input type="email" value={correo} onChange={evento => setCorreo(evento.target.value)} autoComplete="email" placeholder="correo@empresa.com" />
            </label>
            <label>Contraseña
                <input type="password" value={contrasena} onChange={evento => setContrasena(evento.target.value)} autoComplete="current-password" placeholder="Tu contraseña" />
            </label>
            {error && <p className="message-error">{error}</p>}
            <button type="submit" className="button-primary" disabled={cargando}>{cargando ? "Ingresando..." : "Ingresar"}</button>
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

            const { error: errorSesion } = await supabase.auth.signInWithPassword({
                email: correo.trim(),
                password
            });

            if(errorSesion){
                setExito("Cuenta creada. Ahora podés iniciar sesión con tu correo y contraseña.");
            }
        }catch(errorRegistro){
            setError(errorRegistro.message || "No se pudo completar el registro.");
        }finally{
            setCargando(false);
        }
    }

    return(
        <form onSubmit={registrar} className="login-form">
            <label>Nombre completo
                <input type="text" value={nombre} onChange={evento => setNombre(evento.target.value)} autoComplete="name" placeholder="Tu nombre" />
            </label>
            <label>Empresa
                <input type="text" value={empresa} onChange={evento => setEmpresa(evento.target.value)} placeholder="Nombre de tu empresa" />
            </label>
            <label>Correo electrónico
                <input type="email" value={correo} onChange={evento => setCorreo(evento.target.value)} autoComplete="email" placeholder="correo@empresa.com" />
            </label>
            <label>Repite el correo
                <input type="email" value={repiteCorreo} onChange={evento => setRepiteCorreo(evento.target.value)} placeholder="correo@empresa.com" />
            </label>
            <label>Contraseña
                <input type="password" value={password} onChange={evento => setPassword(evento.target.value)} autoComplete="new-password" placeholder="Mínimo 6 caracteres" />
            </label>
            <label>Confirmar contraseña
                <input type="password" value={confirmarPassword} onChange={evento => setConfirmarPassword(evento.target.value)} autoComplete="new-password" placeholder="Repite tu contraseña" />
            </label>
            {error && <p className="message-error">{error}</p>}
            {exito && <p className="message-success">{exito}</p>}
            <button type="submit" className="button-primary" disabled={cargando}>{cargando ? "Registrando..." : "Registrar usuario"}</button>
        </form>
    );
}

function Login(){
    const [pestana, setPestana] = useState("ingreso");

    return(
        <main className="login-page">
            <section className="login-card">
                <div className="login-brand">
                    <span className="brand-mark">SC</span>
                    <span>Sistema Contable</span>
                </div>
                <p className="eyebrow">Acceso al sistema</p>
                <h1>{pestana === "ingreso" ? "Iniciar sesión" : "Crear cuenta"}</h1>
                <p className="login-copy">
                    {pestana === "ingreso"
                        ? "Ingresá con tu usuario para consultar y registrar información contable."
                        : "Registrá tu empresa y tu usuario para empezar a usar el sistema."}
                </p>

                <div className="auth-tabs" role="tablist">
                    <button type="button" role="tab" aria-selected={pestana === "ingreso"} className={pestana === "ingreso" ? "auth-tab is-active" : "auth-tab"} onClick={() => setPestana("ingreso")}>Iniciar sesión</button>
                    <button type="button" role="tab" aria-selected={pestana === "registro"} className={pestana === "registro" ? "auth-tab is-active" : "auth-tab"} onClick={() => setPestana("registro")}>Crear cuenta</button>
                </div>

                {pestana === "ingreso" ? <FormularioIngreso /> : <FormularioRegistro />}
            </section>
        </main>
    );
}

export default Login;