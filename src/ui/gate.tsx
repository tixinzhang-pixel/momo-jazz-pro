import { ROLES, type RoleInfo } from '../session.ts'
import type { RoleId } from '../types.ts'

export function Gate({ onChoose }: { onChoose: (id: RoleId) => void }) {
  return (
    <section class="gate">
      <header class="topbar">
        <div class="brand">
          <p class="brand-en">MOMO</p>
          <p class="brand-sub">Jazz Pro</p>
        </div>
        <p class="brand-zh">家庭音乐工作室</p>
      </header>
      <div class="gate-copy">
        <h1>你的乐器</h1>
        <p>选一次就好。谱面、静音和对四搭档会按这个来。</p>
      </div>
      <div class="role-grid">
        {ROLES.map((role) => (
          <button key={role.id} type="button" class="role" onClick={() => onChoose(role.id)}>
            <RoleMark role={role} />
            <span class="role-name">{role.name}</span>
            <span class="role-hint">{role.hint}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function RoleMark({ role }: { role: RoleInfo }) {
  const latin = role.mark.includes('♭') || role.mark === 'F'
  return <span class={latin ? 'mark latin' : 'mark'}>{role.mark}</span>
}
