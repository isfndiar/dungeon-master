"use client";

import type { SkillKind } from "@/lib/game/heroes";

export function SkillIcon({ kind, size = 28 }: { kind: SkillKind; size?: number }) {
  const icon = kind === "spin" ? "swordstorm" : kind;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      {renderIcon(icon)}
    </svg>
  );
}

function renderIcon(kind: string) {
  switch (kind) {
    case "charge":
      return <ChargeIcon />;
    case "swordstorm":
      return <SwordstormIcon />;
    case "warcry":
      return <WarcryIcon />;
    case "frostnova":
      return <FrostnovaIcon />;
    case "meteor":
      return <MeteorIcon />;
    case "blink":
      return <BlinkIcon />;
    case "smite":
      return <SmiteIcon />;
    case "heal":
      return <HealIcon />;
    case "sanctuary":
      return <SanctuaryIcon />;
    case "groundslam":
      return <GroundslamIcon />;
    case "taunt":
      return <TauntIcon />;
    case "berserk":
      return <BerserkIcon />;
    case "multishot":
      return <MultishotIcon />;
    case "rapidfire":
      return <RapidfireIcon />;
    case "snipe":
      return <SnipeIcon />;
    default:
      return null;
  }
}

/* ─── Knight: Charge ─── */
function ChargeIcon() {
  const main = "#e8e8f0";
  const dark = "#9a9ab0";
  return (
    <>
      {/* Arrow shaft */}
      <rect x={2} y={7} width={8} height={2} fill={main} />
      {/* Arrow head */}
      <rect x={10} y={6} width={2} height={4} fill={main} />
      <rect x={12} y={5} width={2} height={6} fill={main} />
      <rect x={14} y={6} width={1} height={4} fill={dark} />
      {/* Speed lines */}
      <rect x={1} y={5} width={3} height={1} fill={dark} />
      <rect x={0} y={10} width={4} height={1} fill={dark} />
      <rect x={1} y={12} width={2} height={1} fill={dark} />
    </>
  );
}

/* ─── Knight: Sword Storm ─── */
function SwordstormIcon() {
  const main = "#d0d0e0";
  const dark = "#7a7a99";
  return (
    <>
      {/* Center sword vertical */}
      <rect x={7} y={1} width={2} height={6} fill={main} />
      <rect x={7} y={7} width={2} height={2} fill={dark} />
      {/* Sword top-right */}
      <rect x={11} y={2} width={2} height={5} fill={main} />
      <rect x={11} y={7} width={2} height={1} fill={dark} />
      {/* Sword top-left */}
      <rect x={3} y={2} width={2} height={5} fill={main} />
      <rect x={3} y={7} width={2} height={1} fill={dark} />
      {/* Sword bottom-right */}
      <rect x={12} y={9} width={2} height={4} fill={main} />
      <rect x={12} y={13} width={2} height={1} fill={dark} />
      {/* Sword bottom-left */}
      <rect x={2} y={9} width={2} height={4} fill={main} />
      <rect x={2} y={13} width={2} height={1} fill={dark} />
      {/* Radiating dots */}
      <rect x={6} y={10} width={1} height={1} fill={dark} />
      <rect x={9} y={10} width={1} height={1} fill={dark} />
      <rect x={7} y={13} width={2} height={1} fill={dark} />
    </>
  );
}

/* ─── Knight: War Cry ─── */
function WarcryIcon() {
  const red = "#e03030";
  const gold = "#ffd24a";
  const dark = "#8a2020";
  return (
    <>
      {/* Face outline */}
      <rect x={5} y={4} width={6} height={7} fill={red} />
      <rect x={6} y={3} width={4} height={1} fill={red} />
      {/* Eyes */}
      <rect x={6} y={6} width={2} height={1} fill={dark} />
      <rect x={9} y={6} width={2} height={1} fill={dark} />
      {/* Mouth open */}
      <rect x={6} y={9} width={4} height={2} fill={dark} />
      {/* Sound waves left */}
      <rect x={2} y={5} width={1} height={5} fill={gold} />
      <rect x={0} y={6} width={1} height={3} fill={gold} />
      {/* Sound waves right */}
      <rect x={13} y={5} width={1} height={5} fill={gold} />
      <rect x={15} y={6} width={1} height={3} fill={gold} />
      {/* Top wave */}
      <rect x={4} y={1} width={1} height={2} fill={gold} />
      <rect x={11} y={1} width={1} height={2} fill={gold} />
    </>
  );
}

/* ─── Mage: Frost Nova ─── */
function FrostnovaIcon() {
  const main = "#7ad7ff";
  const dark = "#3a8fbf";
  const light = "#c0f0ff";
  return (
    <>
      {/* Center crystal */}
      <rect x={7} y={7} width={2} height={2} fill={light} />
      {/* Spokes - vertical */}
      <rect x={7} y={1} width={2} height={5} fill={main} />
      <rect x={7} y={10} width={2} height={5} fill={main} />
      {/* Spokes - horizontal */}
      <rect x={1} y={7} width={5} height={2} fill={main} />
      <rect x={10} y={7} width={5} height={2} fill={main} />
      {/* Diagonal arms */}
      <rect x={3} y={3} width={2} height={2} fill={dark} />
      <rect x={11} y={3} width={2} height={2} fill={dark} />
      <rect x={3} y={11} width={2} height={2} fill={dark} />
      <rect x={11} y={11} width={2} height={2} fill={dark} />
      {/* Tips */}
      <rect x={7} y={0} width={2} height={1} fill={light} />
      <rect x={7} y={15} width={2} height={1} fill={light} />
      <rect x={0} y={7} width={1} height={2} fill={light} />
      <rect x={15} y={7} width={1} height={2} fill={light} />
    </>
  );
}

/* ─── Mage: Meteor ─── */
function MeteorIcon() {
  const orange = "#ff6a1a";
  const red = "#cc3300";
  const yellow = "#ffcc00";
  return (
    <>
      {/* Trail */}
      <rect x={2} y={2} width={2} height={2} fill={red} />
      <rect x={4} y={3} width={2} height={2} fill={red} />
      <rect x={3} y={1} width={1} height={1} fill={orange} />
      <rect x={1} y={3} width={1} height={1} fill={orange} />
      {/* Fireball body */}
      <rect x={6} y={5} width={4} height={4} fill={orange} />
      <rect x={7} y={4} width={3} height={1} fill={orange} />
      <rect x={5} y={6} width={1} height={3} fill={orange} />
      <rect x={10} y={6} width={1} height={2} fill={red} />
      <rect x={7} y={9} width={3} height={1} fill={red} />
      {/* Core */}
      <rect x={7} y={6} width={2} height={2} fill={yellow} />
      {/* Impact lines */}
      <rect x={9} y={10} width={2} height={1} fill={red} />
      <rect x={10} y={11} width={2} height={2} fill={red} />
      <rect x={12} y={12} width={2} height={1} fill={orange} />
      <rect x={11} y={13} width={1} height={2} fill={orange} />
    </>
  );
}

/* ─── Mage: Blink ─── */
function BlinkIcon() {
  const purple = "#b388ff";
  const dark = "#7744cc";
  const light = "#d4bbff";
  return (
    <>
      {/* Lightning bolt shape */}
      <rect x={8} y={1} width={3} height={2} fill={light} />
      <rect x={7} y={3} width={3} height={2} fill={purple} />
      <rect x={6} y={5} width={4} height={2} fill={purple} />
      <rect x={5} y={7} width={5} height={2} fill={purple} />
      <rect x={7} y={9} width={3} height={2} fill={purple} />
      <rect x={6} y={11} width={3} height={2} fill={dark} />
      <rect x={5} y={13} width={2} height={2} fill={dark} />
      {/* Sparkles */}
      <rect x={2} y={4} width={1} height={1} fill={light} />
      <rect x={13} y={6} width={1} height={1} fill={light} />
      <rect x={3} y={10} width={1} height={1} fill={light} />
      <rect x={12} y={11} width={1} height={1} fill={light} />
    </>
  );
}

/* ─── Priest: Smite ─── */
function SmiteIcon() {
  const gold = "#ffd24a";
  const dark = "#b89530";
  const light = "#fff0a0";
  return (
    <>
      {/* Downward bolt */}
      <rect x={6} y={0} width={4} height={2} fill={light} />
      <rect x={7} y={2} width={3} height={2} fill={gold} />
      <rect x={8} y={4} width={2} height={2} fill={gold} />
      <rect x={6} y={5} width={2} height={2} fill={gold} />
      <rect x={5} y={7} width={3} height={2} fill={gold} />
      <rect x={6} y={9} width={2} height={2} fill={gold} />
      <rect x={7} y={11} width={2} height={2} fill={dark} />
      {/* Impact burst */}
      <rect x={4} y={13} width={8} height={2} fill={gold} />
      <rect x={5} y={12} width={6} height={1} fill={light} />
      {/* Side sparks */}
      <rect x={3} y={3} width={1} height={1} fill={dark} />
      <rect x={12} y={4} width={1} height={1} fill={dark} />
    </>
  );
}

/* ─── Priest: Heal ─── */
function HealIcon() {
  const green = "#5fff8f";
  const dark = "#2a9944";
  const light = "#aaffcc";
  return (
    <>
      {/* Cross vertical */}
      <rect x={6} y={2} width={4} height={12} fill={green} />
      {/* Cross horizontal */}
      <rect x={2} y={6} width={12} height={4} fill={green} />
      {/* Inner highlight */}
      <rect x={7} y={4} width={2} height={8} fill={light} />
      <rect x={4} y={7} width={8} height={2} fill={light} />
      {/* Center glow */}
      <rect x={7} y={7} width={2} height={2} fill={"#ffffff"} />
      {/* Corner accents */}
      <rect x={3} y={3} width={1} height={1} fill={dark} />
      <rect x={12} y={3} width={1} height={1} fill={dark} />
      <rect x={3} y={12} width={1} height={1} fill={dark} />
      <rect x={12} y={12} width={1} height={1} fill={dark} />
    </>
  );
}

/* ─── Priest: Sanctuary ─── */
function SanctuaryIcon() {
  const gold = "#ffd24a";
  const dark = "#b89530";
  const light = "#fff0a0";
  return (
    <>
      {/* Dome arc */}
      <rect x={3} y={10} width={10} height={2} fill={dark} />
      <rect x={2} y={8} width={12} height={2} fill={gold} />
      <rect x={3} y={6} width={10} height={2} fill={gold} />
      <rect x={4} y={4} width={8} height={2} fill={gold} />
      <rect x={5} y={3} width={6} height={1} fill={light} />
      <rect x={6} y={2} width={4} height={1} fill={light} />
      {/* Ground line */}
      <rect x={1} y={12} width={14} height={1} fill={dark} />
      {/* Cross on top */}
      <rect x={7} y={0} width={2} height={2} fill={light} />
      {/* Inner glow */}
      <rect x={6} y={6} width={4} height={4} fill={light} />
      <rect x={7} y={7} width={2} height={2} fill={"#ffffff"} />
    </>
  );
}

/* ─── Tank: Ground Slam ─── */
function GroundslamIcon() {
  const grey = "#8a8f99";
  const dark = "#555b66";
  const light = "#c0c5d0";
  return (
    <>
      {/* Fist */}
      <rect x={5} y={2} width={6} height={5} fill={grey} />
      <rect x={6} y={1} width={4} height={1} fill={light} />
      <rect x={5} y={7} width={6} height={2} fill={dark} />
      {/* Knuckle highlights */}
      <rect x={6} y={3} width={1} height={2} fill={light} />
      <rect x={8} y={3} width={1} height={2} fill={light} />
      {/* Impact waves */}
      <rect x={3} y={10} width={10} height={1} fill={grey} />
      <rect x={1} y={12} width={14} height={1} fill={grey} />
      <rect x={0} y={14} width={16} height={1} fill={dark} />
      {/* Debris */}
      <rect x={2} y={9} width={1} height={1} fill={light} />
      <rect x={13} y={9} width={1} height={1} fill={light} />
      <rect x={4} y={11} width={1} height={1} fill={dark} />
      <rect x={11} y={11} width={1} height={1} fill={dark} />
    </>
  );
}

/* ─── Tank: Taunt (Bulwark) ─── */
function TauntIcon() {
  const silver = "#9aa3b5";
  const dark = "#5a6377";
  const blue = "#6688cc";
  return (
    <>
      {/* Shield outline */}
      <rect x={3} y={2} width={10} height={10} fill={silver} />
      <rect x={4} y={12} width={8} height={1} fill={silver} />
      <rect x={5} y={13} width={6} height={1} fill={dark} />
      <rect x={6} y={14} width={4} height={1} fill={dark} />
      <rect x={7} y={15} width={2} height={1} fill={dark} />
      {/* Shield inner */}
      <rect x={5} y={4} width={6} height={7} fill={dark} />
      {/* Emblem - vertical bar */}
      <rect x={7} y={5} width={2} height={5} fill={blue} />
      {/* Emblem - horizontal bar */}
      <rect x={6} y={6} width={4} height={2} fill={blue} />
      {/* Top highlight */}
      <rect x={4} y={2} width={8} height={1} fill={"#c0c8dd"} />
    </>
  );
}

/* ─── Tank: Berserk ─── */
function BerserkIcon() {
  const red = "#ff3a1a";
  const dark = "#aa2010";
  const orange = "#ff8844";
  return (
    <>
      {/* Flame base */}
      <rect x={4} y={12} width={8} height={2} fill={dark} />
      <rect x={3} y={10} width={10} height={2} fill={red} />
      <rect x={4} y={8} width={8} height={2} fill={red} />
      <rect x={5} y={6} width={6} height={2} fill={red} />
      {/* Flame tips */}
      <rect x={6} y={4} width={2} height={2} fill={orange} />
      <rect x={9} y={3} width={2} height={3} fill={orange} />
      <rect x={3} y={7} width={2} height={3} fill={orange} />
      <rect x={11} y={8} width={2} height={2} fill={orange} />
      {/* Top flicker */}
      <rect x={7} y={2} width={1} height={2} fill={orange} />
      <rect x={10} y={1} width={1} height={2} fill={red} />
      {/* Core */}
      <rect x={6} y={9} width={4} height={3} fill={orange} />
      <rect x={7} y={10} width={2} height={2} fill={"#ffcc44"} />
    </>
  );
}

/* ─── Archer: Multishot ─── */
function MultishotIcon() {
  const gold = "#ffd24a";
  const dark = "#b89530";
  const light = "#fff0a0";
  return (
    <>
      {/* Left arrow */}
      <rect x={1} y={3} width={1} height={2} fill={gold} />
      <rect x={2} y={4} width={6} height={1} fill={gold} />
      <rect x={2} y={2} width={1} height={1} fill={dark} />
      {/* Center arrow */}
      <rect x={3} y={7} width={1} height={2} fill={light} />
      <rect x={4} y={7} width={8} height={2} fill={gold} />
      <rect x={12} y={6} width={2} height={1} fill={gold} />
      <rect x={12} y={9} width={2} height={1} fill={gold} />
      <rect x={14} y={7} width={2} height={2} fill={light} />
      {/* Right arrow (bottom fan) */}
      <rect x={1} y={12} width={1} height={2} fill={gold} />
      <rect x={2} y={12} width={6} height={1} fill={gold} />
      <rect x={2} y={14} width={1} height={1} fill={dark} />
      {/* Arrowheads */}
      <rect x={8} y={3} width={1} height={2} fill={light} />
      <rect x={8} y={11} width={1} height={2} fill={light} />
    </>
  );
}

/* ─── Archer: Rapid Fire ─── */
function RapidfireIcon() {
  const green = "#3f8f5a";
  const dark = "#2a5a3a";
  const light = "#6abf7a";
  return (
    <>
      {/* Arrow shaft */}
      <rect x={2} y={7} width={10} height={2} fill={green} />
      {/* Arrow head */}
      <rect x={12} y={6} width={2} height={4} fill={green} />
      <rect x={14} y={7} width={2} height={2} fill={light} />
      {/* Fletching */}
      <rect x={2} y={5} width={2} height={2} fill={dark} />
      <rect x={2} y={9} width={2} height={2} fill={dark} />
      {/* Speed lines */}
      <rect x={0} y={4} width={4} height={1} fill={light} />
      <rect x={0} y={11} width={4} height={1} fill={light} />
      <rect x={1} y={2} width={3} height={1} fill={dark} />
      <rect x={0} y={13} width={3} height={1} fill={dark} />
      {/* Motion blur lines */}
      <rect x={5} y={5} width={2} height={1} fill={dark} />
      <rect x={5} y={10} width={2} height={1} fill={dark} />
    </>
  );
}

/* ─── Archer: Snipe ─── */
function SnipeIcon() {
  const red = "#ff5a5a";
  const dark = "#aa3030";
  const light = "#ff9999";
  return (
    <>
      {/* Outer ring */}
      <rect x={5} y={1} width={6} height={1} fill={red} />
      <rect x={5} y={14} width={6} height={1} fill={red} />
      <rect x={1} y={5} width={1} height={6} fill={red} />
      <rect x={14} y={5} width={1} height={6} fill={red} />
      <rect x={3} y={2} width={2} height={1} fill={red} />
      <rect x={11} y={2} width={2} height={1} fill={red} />
      <rect x={3} y={13} width={2} height={1} fill={red} />
      <rect x={11} y={13} width={2} height={1} fill={red} />
      <rect x={2} y={3} width={1} height={2} fill={red} />
      <rect x={13} y={3} width={1} height={2} fill={red} />
      <rect x={2} y={11} width={1} height={2} fill={red} />
      <rect x={13} y={11} width={1} height={2} fill={red} />
      {/* Crosshair lines */}
      <rect x={7} y={0} width={2} height={5} fill={dark} />
      <rect x={7} y={11} width={2} height={5} fill={dark} />
      <rect x={0} y={7} width={5} height={2} fill={dark} />
      <rect x={11} y={7} width={5} height={2} fill={dark} />
      {/* Center dot */}
      <rect x={7} y={7} width={2} height={2} fill={light} />
    </>
  );
}
