import React from 'react';

// Posiciones del equipamiento, en el orden en que las entrega el juego.
const SLOTS = ['Arma derecha', 'Arma izquierda', 'Casco', 'Armadura', 'Pantalón', 'Guantes', 'Botas', 'Alas', 'Mascota', 'Colgante', 'Anillo izquierdo', 'Anillo derecho'];

function Item({ item }) {
  const label = SLOTS[item.slot] || `Ranura ${item.slot + 1}`;
  if (item.empty) {
    return (
      <li className="eq__item eq__item--empty">
        <div className="eq__img" />
        <div><small>{label}</small><p className="rk-dim">Vacío</p></div>
      </li>
    );
  }
  const badges = [
    item.skill && 'Skill',
    item.luck && 'Suerte',
    item.option > 0 && `Opción +${item.option}`,
    item.ancient > 0 && 'Ancient',
    item.harmony,
    item.sockets > 0 && `Socket ×${item.sockets}`,
    item.refinery && 'Refinado',
    item.temporal && 'Temporal',
  ].filter(Boolean);

  return (
    <li className={`eq__item eq--${item.rarity}`}>
      <div className="eq__img">
        {item.image && <img src={item.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />}
      </div>
      <div className="eq__body">
        <small>{label}</small>
        <p className="eq__name">{item.name}{item.level > 0 && <b> +{item.level}</b>}</p>
        {badges.length > 0 && <div className="eq__tags">{badges.map((b) => <span key={b} className="tag">{b}</span>)}</div>}
        {item.excellent.length > 0 && <ul className="eq__exc">{item.excellent.map((o) => <li key={o}>{o}</li>)}</ul>}
      </div>
    </li>
  );
}

export default function Equipment({ items }) {
  return <ul className="eq">{items.map((it) => <Item key={it.slot} item={it} />)}</ul>;
}
