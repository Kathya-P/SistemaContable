import { useEffect, useState } from "react";
import { solicitarApi } from "../services/api";
import { exportarUsuariosPDF } from "../services/exportationService";
import ExportarPdfButton from "./ExportarPdfButton";

const ROLES = ["ADMIN", "CONTADOR", "AUXILIAR"];
const formularioVacio = { nombre: "", correo: "", correo2: "", password: "", rol: "CONTADOR" };

function GestionUsuarios({ usuario }){
    const [usuarios, setUsuarios] = useState([]);
    const [formulario, setFormulario] = useState(formularioVacio);
    const [mensaje, setMensaje] = useState("");
    const [error, setError] = useState("");
    const [enviando, setEnviando] = useState(false);

const [version, setVersion] = useState(0);
const recargar = () => setVersion(actual => actual + 1);

useEffect(() => {
    let cancelado = false;

    solicitarApi("/usuarios")
        .then(datos => {
            if(!cancelado){
                setUsuarios(datos || []);
            }
        })
        .catch(errorCarga => {
            if(!cancelado){
                setError(errorCarga.message || "No se pudieron cargar los usuarios.");
            }
        });

    return () => {
        cancelado = true;
    };
}, [version]);

    const campo = nombre => evento => setFormulario(actual => ({ ...actual, [nombre]: evento.target.value }));

    async function crearUsuario(evento){
        evento.preventDefault();
        setError("");
        setMensaje("");

        if(formulario.correo.trim().toLowerCase() !== formulario.correo2.trim().toLowerCase()){
            setError("Los correos no coinciden.");
            return;
        }

        try{
            setEnviando(true);
            await solicitarApi("/usuarios", {
                method: "POST",
                body: JSON.stringify({
                    nombre: formulario.nombre,
                    correo: formulario.correo,
                    password: formulario.password,
                    rol: formulario.rol
                })
            });
            setMensaje("Usuario creado. Ya puede iniciar sesión con ese correo y esa contraseña.");
            setFormulario(formularioVacio);
            recargar();
        }catch(errorCrear){
            setError(errorCrear.message || "No se pudo crear el usuario.");
        }finally{
            setEnviando(false);
        }
    }

    async function actualizar(id, cambios){
        setError("");
        setMensaje("");

        try{
            await solicitarApi(`/usuarios/${id}`, {
                method: "PATCH",
                body: JSON.stringify(cambios)
            });
            recargar();
        }catch(errorActualizar){
            setError(errorActualizar.message || "No se pudo actualizar el usuario.");
        }
    }

    function manejarExportacionPDF() {
        exportarUsuariosPDF({ usuarios });
    }

    return(
        <section className="view-section">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Administración</p>
                    <h1>Usuarios de la empresa</h1>
                </div>
                <ExportarPdfButton onExport={manejarExportacionPDF} reporte="Usuarios" disabled={!usuarios.length} />
            </div>

            <form onSubmit={crearUsuario} className="entry-form">
                <h2>Nuevo usuario</h2>
                <p className="form-help">El usuario tendrá acceso únicamente a tu empresa.</p>

                <div className="form-grid">
                    <label>Nombre completo
                        <input required value={formulario.nombre} onChange={campo("nombre")} />
                    </label>
                    <label>Rol
                        <select value={formulario.rol} onChange={campo("rol")}>
                            {ROLES.map(rol => <option key={rol} value={rol}>{rol}</option>)}
                        </select>
                    </label>
                    <label>Correo
                        <input required type="email" value={formulario.correo} onChange={campo("correo")} />
                    </label>
                    <label>Repite el correo
                        <input required type="email" value={formulario.correo2} onChange={campo("correo2")} />
                    </label>
                    <label>Contraseña (mínimo 6 caracteres)
                        <input required type="password" minLength={6} autoComplete="new-password" value={formulario.password} onChange={campo("password")} />
                    </label>
                </div>
                <p className="form-help">Debes escribir el correo 2 veces para evitar errores.</p>

                {error && <p className="message-error">{error}</p>}
                {mensaje && <p className="message-success">{mensaje}</p>}

                <button type="submit" className="button-primary" disabled={enviando}>
                    {enviando ? "Creando..." : "Crear usuario"}
                </button>
            </form>

            <h2>Equipo</h2>
            <div className="detail-table-shell">
                <table className="entry-detail-table">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Correo</th>
                            <th>Rol</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {usuarios.map(fila => {
                            const esYo = fila.id === usuario.id;

                            return (
                                <tr key={fila.id}>
                                    <td>{fila.nombre}{esYo ? " (tú)" : ""}</td>
                                    <td>{fila.correo}</td>
                                    <td>
                                        <select
                                            value={fila.rol}
                                            disabled={esYo}
                                            onChange={evento => actualizar(fila.id, { rol: evento.target.value })}
                                            aria-label={`Rol de ${fila.nombre}`}
                                        >
                                            {ROLES.map(rol => <option key={rol} value={rol}>{rol}</option>)}
                                        </select>
                                    </td>
                                    <td>
                                        {fila.estado ? "Activo" : "Inactivo"}{" "}
                                        <button
                                            type="button"
                                            className="button-secondary"
                                            disabled={esYo}
                                            onClick={() => actualizar(fila.id, { estado: !fila.estado })}
                                        >
                                            {fila.estado ? "Desactivar" : "Activar"}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <h2>Qué puede hacer cada rol</h2>
            <div className="detail-table-shell">
                <table className="entry-detail-table">
                    <thead>
                        <tr>
                            <th>Rol</th>
                            <th>Catálogo</th>
                            <th>Registrar asientos</th>
                            <th>Contabilizar</th>
                            <th>Anular</th>
                            <th>Reportes</th>
                            <th>Usuarios</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>ADMIN</td><td>Sí</td><td>Sí</td><td>Sí</td><td>Sí</td><td>Sí</td><td>Sí</td></tr>
                        <tr><td>CONTADOR</td><td>Sí</td><td>Sí</td><td>Sí</td><td>Sí</td><td>Sí</td><td>No</td></tr>
                        <tr><td>AUXILIAR</td><td>Sí</td><td>Sí</td><td>No</td><td>No</td><td>Sí</td><td>No</td></tr>
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default GestionUsuarios;