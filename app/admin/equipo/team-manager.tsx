"use client";
import { FormEvent, useState } from "react";
import { MailPlus, Save, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
export type TeamMember = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  role: "ADMIN" | "GUIDE";
  active: boolean;
  created_at: string;
  hike_ids: string[];
};
export type TeamHike = { id: string; name: string; starts_at: string };
export function TeamManager({
  members,
  hikes,
}: {
  members: TeamMember[];
  hikes: TeamHike[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("invite");
    setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(data)),
    });
    const result = (await response.json()) as { error?: string };
    setBusy("");
    if (!response.ok)
      return setMessage(result.error ?? "No pudimos enviar la invitación.");
    event.currentTarget.reset();
    setMessage(
      "Invitación enviada. La persona recibirá un acceso seguro por correo.",
    );
    router.refresh();
  }
  async function save(member: TeamMember, form: HTMLFormElement) {
    setBusy(member.id);
    setMessage("");
    const data = new FormData(form);
    const response = await fetch("/api/admin/team", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: member.id,
        firstName: data.get("firstName"),
        lastName: data.get("lastName"),
        phone: data.get("phone") || null,
        role: data.get("role"),
        active: data.get("active") === "on",
        hikeIds: data.getAll("hikeIds"),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy("");
    if (!response.ok) return setMessage(result.error ?? "No pudimos guardar.");
    setMessage("Acceso actualizado.");
    router.refresh();
  }
  return (
    <>
      <form className="team-invite" onSubmit={invite}>
        <div>
          <MailPlus />
          <span>
            <strong>INVITAR AL EQUIPO</strong>
            <small>Supabase enviará un enlace de acceso al correo.</small>
          </span>
        </div>
        <input required name="firstName" placeholder="Nombre" />
        <input required name="lastName" placeholder="Apellido" />
        <input
          required
          name="email"
          type="email"
          placeholder="correo@ejemplo.com"
        />
        <input
          name="phone"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]{10}"
          placeholder="Teléfono MX · 10 dígitos"
        />
        <select name="role" defaultValue="GUIDE">
          <option value="GUIDE">Guía</option>
          <option value="ADMIN">Administrador</option>
        </select>
        <button className="button button-primary" disabled={busy === "invite"}>
          {busy === "invite" ? "ENVIANDO…" : "ENVIAR INVITACIÓN"}
        </button>
      </form>
      {message && <p className="admin-feedback">{message}</p>}
      <div className="team-grid">
        {members.map((member) => (
          <form
            key={member.id}
            onSubmit={(e) => {
              e.preventDefault();
              void save(member, e.currentTarget);
            }}
          >
            <div className="team-person">
              <i>
                <UserRound />
              </i>
              <span>
                <strong>
                  {member.first_name} {member.last_name}
                </strong>
                <small>{member.email}</small>
              </span>
              <em className={member.active ? "active" : ""}>
                {member.active ? "ACTIVO" : "INACTIVO"}
              </em>
            </div>
            <div className="form-grid">
              <label>
                NOMBRE
                <input name="firstName" defaultValue={member.first_name} />
              </label>
              <label>
                APELLIDO
                <input name="lastName" defaultValue={member.last_name} />
              </label>
              <label>
                TELÉFONO
                <input
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  defaultValue={member.phone?.replace(/^\+52/, "") ?? ""}
                />
              </label>
              <label>
                ROL
                <select name="role" defaultValue={member.role}>
                  <option value="GUIDE">Guía</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </label>
            </div>
            <label className="cms-toggle">
              <input
                type="checkbox"
                name="active"
                defaultChecked={member.active}
              />
              <i />
              <b>Puede ingresar</b>
            </label>
            <fieldset className="team-hike-access">
              <legend>HIKES ASIGNADOS · SÓLO PARA GUÍAS</legend>
              {hikes.length ? (
                hikes.map((hike) => (
                  <label key={hike.id}>
                    <input
                      type="checkbox"
                      name="hikeIds"
                      value={hike.id}
                      defaultChecked={member.hike_ids.includes(hike.id)}
                    />
                    <span>{hike.name}</span>
                  </label>
                ))
              ) : (
                <small>No hay hikes próximos para asignar.</small>
              )}
            </fieldset>
            <button disabled={busy === member.id}>
              <Save /> GUARDAR CAMBIOS
            </button>
          </form>
        ))}
      </div>
    </>
  );
}
