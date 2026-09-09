import { Vector3Data } from './types.js';

export interface MapSpawnPoint {
  id: string;
  position: Vector3Data;
  yaw: number;
  team: 'red' | 'blue' | 'neutral';
}

export interface MapObstacle {
  id: string;
  position: Vector3Data;
  size: Vector3Data; // width, height, depth
  color: number;
}

export interface MapExplosiveBarrel {
  id: string;
  position: Vector3Data;
  radius: number;
  damage: number;
}

export interface MapJumpPad {
  id: string;
  position: Vector3Data;
  boostY: number;
}

export interface MapDefinition {
  id: string;
  name: string;
  bounds: { min: Vector3Data; max: Vector3Data };
  spawnPoints: MapSpawnPoint[];
  obstacles: MapObstacle[];
  explosiveBarrels: MapExplosiveBarrel[];
  jumpPads: MapJumpPad[];
  floorSize: { width: number; length: number };
}

export const TEST_MAP: MapDefinition = {
  id: "test_arena",
  name: "Cyberpunk Mega Arena",
  bounds: {
    min: { x: -80, y: 0, z: -80 },
    max: { x: 80, y: 40, z: 80 }
  },
  floorSize: { width: 160, length: 160 },
  spawnPoints: [
    { id: "center_spawn", position: { x: 0,   y: 1.0, z: -25 }, yaw: 0,     team: "neutral" },
    { id: "red_1",     position: { x: -55, y: 1.0, z: -55 }, yaw: 0.78,  team: "red" },
    { id: "red_2",     position: { x: -60, y: 1.0, z: -45 }, yaw: 0.78,  team: "red" },
    { id: "red_3",     position: { x: -45, y: 1.0, z: -60 }, yaw: 0.78,  team: "red" },
    { id: "blue_1",    position: { x: 55,  y: 1.0, z: 55 },  yaw: -2.35, team: "blue" },
    { id: "blue_2",    position: { x: 60,  y: 1.0, z: 45 },  yaw: -2.35, team: "blue" },
    { id: "blue_3",    position: { x: 45,  y: 1.0, z: 60 },  yaw: -2.35, team: "blue" },
    { id: "neutral_1", position: { x: 0,   y: 1.0, z: -65 }, yaw: 0,     team: "neutral" },
    { id: "neutral_2", position: { x: 0,   y: 1.0, z: 65 },  yaw: 3.14,  team: "neutral" },
    { id: "neutral_3", position: { x: -65, y: 1.0, z: 0 },   yaw: 1.57,  team: "neutral" },
    { id: "neutral_4", position: { x: 65,  y: 1.0, z: 0 },   yaw: -1.57, team: "neutral" }
  ],
  jumpPads: [
    { id: "jp_center_n", position: { x: 0,   y: 0.1, z: -18 }, boostY: 19.5 },
    { id: "jp_center_s", position: { x: 0,   y: 0.1, z: 18 },  boostY: 19.5 },
    { id: "jp_west",     position: { x: -35, y: 0.1, z: 0 },   boostY: 19.5 },
    { id: "jp_east",     position: { x: 35,  y: 0.1, z: 0 },   boostY: 19.5 },
    { id: "jp_north",    position: { x: 0,   y: 0.1, z: -52 }, boostY: 19.5 },
    { id: "jp_south",    position: { x: 0,   y: 0.1, z: 52 },  boostY: 19.5 }
  ],
  explosiveBarrels: [
    { id: "barrel_c1", position: { x: -12, y: 1.0, z: -12 }, radius: 8.5, damage: 130 },
    { id: "barrel_c2", position: { x: 12,  y: 1.0, z: -12 }, radius: 8.5, damage: 130 },
    { id: "barrel_c3", position: { x: -12, y: 1.0, z: 12 },  radius: 8.5, damage: 130 },
    { id: "barrel_c4", position: { x: 12,  y: 1.0, z: 12 },  radius: 8.5, damage: 130 },
    { id: "barrel_n1", position: { x: -18, y: 1.0, z: -35 }, radius: 8.5, damage: 130 },
    { id: "barrel_n2", position: { x: 18,  y: 1.0, z: -35 }, radius: 8.5, damage: 130 },
    { id: "barrel_s1", position: { x: -18, y: 1.0, z: 35 },  radius: 8.5, damage: 130 },
    { id: "barrel_s2", position: { x: 18,  y: 1.0, z: 35 },  radius: 8.5, damage: 130 },
    { id: "barrel_w1", position: { x: -45, y: 1.0, z: 0 },   radius: 8.5, damage: 130 },
    { id: "barrel_e1", position: { x: 45,  y: 1.0, z: 0 },   radius: 8.5, damage: 130 },
    { id: "barrel_nw", position: { x: -50, y: 1.0, z: -50 }, radius: 8.5, damage: 130 },
    { id: "barrel_se", position: { x: 50,  y: 1.0, z: 50 },  radius: 8.5, damage: 130 }
  ],
  obstacles: [
    // ── 1. CENTRAL MEGASTRUCTURE & TOWER COMPLEX ──
    { id: "center_pillar_nw", position: { x: -8, y: 4.0, z: -8 }, size: { x: 3, y: 8, z: 3 }, color: 0x00f0ff },
    { id: "center_pillar_ne", position: { x: 8,  y: 4.0, z: -8 }, size: { x: 3, y: 8, z: 3 }, color: 0x00f0ff },
    { id: "center_pillar_sw", position: { x: -8, y: 4.0, z: 8 },  size: { x: 3, y: 8, z: 3 }, color: 0x00f0ff },
    { id: "center_pillar_se", position: { x: 8,  y: 4.0, z: 8 },  size: { x: 3, y: 8, z: 3 }, color: 0x00f0ff },

    { id: "center_wall_n",  position: { x: 0,  y: 2.0, z: -8 }, size: { x: 13, y: 4, z: 1.2 }, color: 0xff0055 },
    { id: "center_wall_s",  position: { x: 0,  y: 2.0, z: 8 },  size: { x: 13, y: 4, z: 1.2 }, color: 0xff0055 },
    { id: "center_wall_w",  position: { x: -8, y: 2.0, z: 0 },  size: { x: 1.2, y: 4, z: 13 }, color: 0xff0055 },
    { id: "center_wall_e",  position: { x: 8,  y: 2.0, z: 0 },  size: { x: 1.2, y: 4, z: 13 }, color: 0xff0055 },

    { id: "center_tower",   position: { x: 0, y: 5.5, z: 0 },   size: { x: 6, y: 11, z: 6 },  color: 0x1e1b4b },

    // ── 2. NORTH QUADRANT (SNIPER TOWER & TACTICAL CRATES) ──
    { id: "north_platform", position: { x: 0, y: 3.5, z: -40 }, size: { x: 24, y: 1.2, z: 12 }, color: 0x1e293b },
    { id: "north_ramp_w",   position: { x: -14, y: 1.8, z: -32 }, size: { x: 4, y: 0.6, z: 10 }, color: 0x334155 },
    { id: "north_ramp_e",   position: { x: 14,  y: 1.8, z: -32 }, size: { x: 4, y: 0.6, z: 10 }, color: 0x334155 },
    { id: "north_cover_1",  position: { x: -22, y: 1.5, z: -25 }, size: { x: 3, y: 3, z: 3 },     color: 0x3b82f6 },
    { id: "north_cover_2",  position: { x: 22,  y: 1.5, z: -25 }, size: { x: 3, y: 3, z: 3 },     color: 0x3b82f6 },
    { id: "north_bunker_1", position: { x: -35, y: 2.0, z: -45 }, size: { x: 10, y: 4, z: 2 },    color: 0x475569 },
    { id: "north_bunker_2", position: { x: 35,  y: 2.0, z: -45 }, size: { x: 10, y: 4, z: 2 },    color: 0x475569 },

    // ── 3. SOUTH QUADRANT (SNIPER TOWER & TACTICAL CRATES) ──
    { id: "south_platform", position: { x: 0, y: 3.5, z: 40 }, size: { x: 24, y: 1.2, z: 12 }, color: 0x1e293b },
    { id: "south_ramp_w",   position: { x: -14, y: 1.8, z: 32 }, size: { x: 4, y: 0.6, z: 10 }, color: 0x334155 },
    { id: "south_ramp_e",   position: { x: 14,  y: 1.8, z: 32 }, size: { x: 4, y: 0.6, z: 10 }, color: 0x334155 },
    { id: "south_cover_1",  position: { x: -22, y: 1.5, z: 25 }, size: { x: 3, y: 3, z: 3 },     color: 0xef4444 },
    { id: "south_cover_2",  position: { x: 22,  y: 1.5, z: 25 }, size: { x: 3, y: 3, z: 3 },     color: 0xef4444 },
    { id: "south_bunker_1", position: { x: -35, y: 2.0, z: 45 }, size: { x: 10, y: 4, z: 2 },    color: 0x475569 },
    { id: "south_bunker_2", position: { x: 35,  y: 2.0, z: 45 }, size: { x: 10, y: 4, z: 2 },    color: 0x475569 },

    // ── 4. WEST LABYRINTH / CORRIDOR COMPLEX ──
    { id: "west_wall_1",    position: { x: -45, y: 2.5, z: -15 }, size: { x: 2, y: 5, z: 20 }, color: 0x0f172a },
    { id: "west_wall_2",    position: { x: -45, y: 2.5, z: 15 },  size: { x: 2, y: 5, z: 20 }, color: 0x0f172a },
    { id: "west_box_1",     position: { x: -32, y: 1.25, z: -8 }, size: { x: 3, y: 2.5, z: 3 }, color: 0x00f0ff },
    { id: "west_box_2",     position: { x: -32, y: 1.25, z: 8 },  size: { x: 3, y: 2.5, z: 3 }, color: 0x00f0ff },
    { id: "west_pillar_1",  position: { x: -55, y: 3.5, z: -30 }, size: { x: 2.5, y: 7, z: 2.5 }, color: 0x6366f1 },
    { id: "west_pillar_2",  position: { x: -55, y: 3.5, z: 30 },  size: { x: 2.5, y: 7, z: 2.5 }, color: 0x6366f1 },

    // ── 5. EAST LABYRINTH / CORRIDOR COMPLEX ──
    { id: "east_wall_1",    position: { x: 45, y: 2.5, z: -15 }, size: { x: 2, y: 5, z: 20 }, color: 0x0f172a },
    { id: "east_wall_2",    position: { x: 45, y: 2.5, z: 15 },  size: { x: 2, y: 5, z: 20 }, color: 0x0f172a },
    { id: "east_box_1",     position: { x: 32, y: 1.25, z: -8 }, size: { x: 3, y: 2.5, z: 3 }, color: 0xff0055 },
    { id: "east_box_2",     position: { x: 32, y: 1.25, z: 8 },  size: { x: 3, y: 2.5, z: 3 }, color: 0xff0055 },
    { id: "east_pillar_1",  position: { x: 55, y: 3.5, z: -30 }, size: { x: 2.5, y: 7, z: 2.5 }, color: 0x6366f1 },
    { id: "east_pillar_2",  position: { x: 55, y: 3.5, z: 30 },  size: { x: 2.5, y: 7, z: 2.5 }, color: 0x6366f1 },

    // ── 6. PERIMETER BOUNDARY WALLS (160m x 160m ARENA) ──
    { id: "wall_north", position: { x: 0,   y: 8.0, z: -80 }, size: { x: 160, y: 16, z: 2 }, color: 0x020617 },
    { id: "wall_south", position: { x: 0,   y: 8.0, z: 80 },  size: { x: 160, y: 16, z: 2 }, color: 0x020617 },
    { id: "wall_east",  position: { x: 80,  y: 8.0, z: 0 },   size: { x: 2, y: 16, z: 160 }, color: 0x020617 },
    { id: "wall_west",  position: { x: -80, y: 8.0, z: 0 },   size: { x: 2, y: 16, z: 160 }, color: 0x020617 }
  ]
};
