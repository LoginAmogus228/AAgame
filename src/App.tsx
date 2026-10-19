import { useState, useEffect, useRef, useCallback } from 'react';

// Types
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
}

interface Enemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  type: 'missile' | 'bomb' | 'drone';
  size: number;
  reward: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Fortification {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  type: 'wall' | 'turret' | 'shield';
}

interface Upgrades {
  pvoDamage: number;
  bulletSpeed: number;
  bulletCount: number;
  fireRate: number;
  fortifications: number;
}

interface GameState {
  score: number;
  wave: number;
  money: number;
  hp: number;
  maxHp: number;
  gameOver: boolean;
  isPaused: boolean;
  showShop: boolean;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const TOWER_X = CANVAS_WIDTH / 2;
const TOWER_Y = CANVAS_HEIGHT - 60;

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const lastShotRef = useRef<number>(0);
  const mouseRef = useRef({ x: TOWER_X, y: 0 });
  const enemiesRef = useRef<Enemy[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const fortificationsRef = useRef<Fortification[]>([]);
  const spawnTimerRef = useRef<number>(0);
  const waveTimerRef = useRef<number>(0);
  const enemiesInWaveRef = useRef<number>(0);
  const enemiesSpawnedRef = useRef<number>(0);

  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    wave: 1,
    money: 0,
    hp: 100,
    maxHp: 100,
    gameOver: false,
    isPaused: false,
    showShop: false,
  });

  const [upgrades, setUpgrades] = useState<Upgrades>({
    pvoDamage: 1,
    bulletSpeed: 1,
    bulletCount: 1,
    fireRate: 1,
    fortifications: 0,
  });

  const getUpgradeCost = (type: keyof Upgrades): number => {
    const costs: Record<keyof Upgrades, number> = {
      pvoDamage: 50 * upgrades.pvoDamage,
      bulletSpeed: 40 * upgrades.bulletSpeed,
      bulletCount: 100 * upgrades.bulletCount,
      fireRate: 60 * upgrades.fireRate,
      fortifications: 80 * (upgrades.fortifications + 1),
    };
    return costs[type];
  };

  const buyUpgrade = (type: keyof Upgrades) => {
    const cost = getUpgradeCost(type);
    if (gameState.money >= cost) {
      setGameState(prev => ({ ...prev, money: prev.money - cost }));
      setUpgrades(prev => ({ ...prev, [type]: prev[type] + 1 }));
      if (type === 'fortifications') {
        addFortification();
      }
    }
  };

  const addFortification = () => {
    const types: Array<'wall' | 'turret' | 'shield'> = ['wall', 'turret', 'shield'];
    const type = types[Math.floor(Math.random() * types.length)];
    const x = 100 + Math.random() * (CANVAS_WIDTH - 200);
    const y = CANVAS_HEIGHT - 100 - Math.random() * 100;
    fortificationsRef.current.push({
      x, y, hp: 50, maxHp: 50, type
    });
  };

  const spawnEnemy = useCallback(() => {
    const types: Array<'missile' | 'bomb' | 'drone'> = ['missile', 'bomb', 'drone'];
    const type = types[Math.floor(Math.random() * Math.min(types.length, 1 + Math.floor(gameState.wave / 3)))];
    
    const side = Math.random() > 0.5 ? 'top' : (Math.random() > 0.5 ? 'left' : 'right');
    let x: number, y: number, vx: number, vy: number;

    if (side === 'top') {
      x = Math.random() * CANVAS_WIDTH;
      y = -20;
      vx = (TOWER_X - x) * 0.003 + (Math.random() - 0.5) * 0.5;
      vy = 0.5 + Math.random() * 0.5 + gameState.wave * 0.1;
    } else if (side === 'left') {
      x = -20;
      y = Math.random() * (CANVAS_HEIGHT / 2);
      vx = 1 + Math.random() * 0.5 + gameState.wave * 0.05;
      vy = 0.5 + Math.random() * 0.3;
    } else {
      x = CANVAS_WIDTH + 20;
      y = Math.random() * (CANVAS_HEIGHT / 2);
      vx = -(1 + Math.random() * 0.5 + gameState.wave * 0.05);
      vy = 0.5 + Math.random() * 0.3;
    }

    const stats = {
      missile: { hp: 2 + gameState.wave, size: 8, reward: 10 },
      bomb: { hp: 4 + gameState.wave * 2, size: 12, reward: 20 },
      drone: { hp: 1 + Math.floor(gameState.wave / 2), size: 6, reward: 5 },
    };

    const s = stats[type];
    enemiesRef.current.push({
      x, y, vx, vy,
      hp: s.hp,
      maxHp: s.hp,
      type,
      size: s.size,
      reward: s.reward,
    });
  }, [gameState.wave]);

  const createExplosion = (x: number, y: number, color: string, count: number = 8) => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
      const speed = 1 + Math.random() * 3;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 30 + Math.random() * 20,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  };

  const shoot = useCallback(() => {
    const now = Date.now();
    const fireInterval = 500 / upgrades.fireRate;
    if (now - lastShotRef.current < fireInterval) return;
    lastShotRef.current = now;

    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    const dx = mx - TOWER_X;
    const dy = my - TOWER_Y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const baseSpeed = 6 * upgrades.bulletSpeed;
    const baseAngle = Math.atan2(dy, dx);
    const spread = 0.15;

    for (let i = 0; i < upgrades.bulletCount; i++) {
      const angleOffset = upgrades.bulletCount > 1 
        ? (i / (upgrades.bulletCount - 1) - 0.5) * spread * 2
        : 0;
      const angle = baseAngle + angleOffset;
      
      bulletsRef.current.push({
        x: TOWER_X,
        y: TOWER_Y - 20,
        vx: Math.cos(angle) * baseSpeed,
        vy: Math.sin(angle) * baseSpeed,
        damage: upgrades.pvoDamage,
      });
    }
  }, [upgrades]);

  const drawPixelRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  const drawTower = (ctx: CanvasRenderingContext2D) => {
    // Base
    drawPixelRect(ctx, TOWER_X - 20, TOWER_Y, 40, 20, '#4a4a4a');
    drawPixelRect(ctx, TOWER_X - 16, TOWER_Y + 4, 32, 12, '#5a5a5a');
    // Body
    drawPixelRect(ctx, TOWER_X - 12, TOWER_Y - 20, 24, 20, '#3a7a3a');
    drawPixelRect(ctx, TOWER_X - 8, TOWER_Y - 16, 16, 12, '#4a8a4a');
    // Barrel
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    const angle = Math.atan2(my - TOWER_Y, mx - TOWER_X);
    ctx.save();
    ctx.translate(TOWER_X, TOWER_Y - 15);
    ctx.rotate(angle);
    drawPixelRect(ctx, 0, -3, 25, 6, '#2a2a2a');
    drawPixelRect(ctx, 20, -4, 8, 8, '#3a3a3a');
    ctx.restore();
    // Radar dish
    drawPixelRect(ctx, TOWER_X - 4, TOWER_Y - 28, 8, 8, '#6a6a6a');
    drawPixelRect(ctx, TOWER_X - 6, TOWER_Y - 30, 12, 4, '#8a8a8a');
  };

  const drawEnemy = (ctx: CanvasRenderingContext2D, enemy: Enemy) => {
    const { x, y, type, size, hp, maxHp } = enemy;
    
    if (type === 'missile') {
      drawPixelRect(ctx, x - 3, y - size, 6, size * 2, '#ff4444');
      drawPixelRect(ctx, x - 2, y - size + 2, 4, size, '#ff6666');
      drawPixelRect(ctx, x - 5, y + size - 4, 4, 4, '#cc2222');
      drawPixelRect(ctx, x + 1, y + size - 4, 4, 4, '#cc2222');
      // Flame
      drawPixelRect(ctx, x - 2, y - size - 4, 4, 4, '#ffaa00');
      drawPixelRect(ctx, x - 1, y - size - 6, 2, 2, '#ffff00');
    } else if (type === 'bomb') {
      drawPixelRect(ctx, x - size/2, y - size/2, size, size, '#444444');
      drawPixelRect(ctx, x - size/2 + 2, y - size/2 + 2, size - 4, size - 4, '#555555');
      drawPixelRect(ctx, x - 2, y - size/2 - 4, 4, 4, '#888888');
      // Fuse spark
      const sparkSize = 2 + Math.sin(Date.now() * 0.01) * 2;
      drawPixelRect(ctx, x - sparkSize/2, y - size/2 - 6 - sparkSize/2, sparkSize, sparkSize, '#ffff00');
    } else {
      // Drone
      drawPixelRect(ctx, x - size, y - 2, size * 2, 4, '#6666ff');
      drawPixelRect(ctx, x - 3, y - 3, 6, 6, '#8888ff');
      // Propellers
      const propOffset = Math.sin(Date.now() * 0.02) * 2;
      drawPixelRect(ctx, x - size - 2 + propOffset, y - 4, 4, 2, '#aaaaff');
      drawPixelRect(ctx, x + size - 2 - propOffset, y - 4, 4, 2, '#aaaaff');
    }

    // HP bar
    if (hp < maxHp) {
      const barWidth = size * 2;
      const barHeight = 3;
      const barY = y - size - 8;
      drawPixelRect(ctx, x - barWidth/2, barY, barWidth, barHeight, '#333');
      drawPixelRect(ctx, x - barWidth/2, barY, barWidth * (hp / maxHp), barHeight, '#00ff00');
    }
  };

  const drawFortification = (ctx: CanvasRenderingContext2D, fort: Fortification) => {
    const { x, y, type, hp, maxHp } = fort;
    
    if (type === 'wall') {
      drawPixelRect(ctx, x - 15, y - 20, 30, 20, '#8B4513');
      drawPixelRect(ctx, x - 13, y - 18, 26, 16, '#A0522D');
      // Bricks
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          const bx = x - 12 + col * 7 + (row % 2) * 3;
          const by = y - 17 + row * 6;
          drawPixelRect(ctx, bx, by, 6, 5, '#6B3410');
        }
      }
    } else if (type === 'turret') {
      drawPixelRect(ctx, x - 10, y - 5, 20, 10, '#4a4a4a');
      drawPixelRect(ctx, x - 6, y - 15, 12, 12, '#3a7a3a');
      drawPixelRect(ctx, x - 2, y - 20, 4, 8, '#2a2a2a');
      // Auto-fire indicator
      drawPixelRect(ctx, x - 1, y - 22, 2, 2, '#ff0');
    } else {
      // Shield
      const pulse = Math.sin(Date.now() * 0.005) * 0.3 + 0.7;
      ctx.globalAlpha = pulse;
      drawPixelRect(ctx, x - 20, y - 25, 40, 30, '#00aaff');
      drawPixelRect(ctx, x - 18, y - 23, 36, 26, '#44ccff');
      ctx.globalAlpha = 1;
      drawPixelRect(ctx, x - 4, y - 15, 8, 8, '#ffffff');
    }

    // HP bar
    if (hp < maxHp) {
      drawPixelRect(ctx, x - 15, y - 28, 30, 3, '#333');
      drawPixelRect(ctx, x - 15, y - 28, 30 * (hp / maxHp), 3, '#00ff00');
    }
  };

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (gameState.gameOver || gameState.isPaused) {
      animationRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Stars background
    ctx.fillStyle = '#ffffff22';
    for (let i = 0; i < 50; i++) {
      const sx = (i * 137 + 50) % CANVAS_WIDTH;
      const sy = (i * 97 + 30) % (CANVAS_HEIGHT - 100);
      ctx.fillRect(sx, sy, 2, 2);
    }

    // Ground
    drawPixelRect(ctx, 0, CANVAS_HEIGHT - 40, CANVAS_WIDTH, 40, '#2d5a27');
    drawPixelRect(ctx, 0, CANVAS_HEIGHT - 40, CANVAS_WIDTH, 4, '#3d7a37');

    // Spawn enemies
    spawnTimerRef.current++;
    const spawnRate = Math.max(30, 90 - gameState.wave * 5);
    if (spawnTimerRef.current >= spawnRate && enemiesSpawnedRef.current < enemiesInWaveRef.current) {
      spawnEnemy();
      spawnTimerRef.current = 0;
      enemiesSpawnedRef.current++;
    }

    // Check wave complete
    if (enemiesSpawnedRef.current >= enemiesInWaveRef.current && enemiesRef.current.length === 0) {
      waveTimerRef.current++;
      if (waveTimerRef.current > 60) {
        setGameState(prev => ({ ...prev, wave: prev.wave + 1 }));
        enemiesInWaveRef.current = 5 + gameState.wave * 3;
        enemiesSpawnedRef.current = 0;
        waveTimerRef.current = 0;
      }
    }

    // Auto-shoot
    shoot();

    // Update bullets
    bulletsRef.current = bulletsRef.current.filter(b => {
      b.x += b.vx;
      b.y += b.vy;
      return b.x > -10 && b.x < CANVAS_WIDTH + 10 && b.y > -10 && b.y < CANVAS_HEIGHT + 10;
    });

    // Update enemies
    let damage = 0;
    enemiesRef.current = enemiesRef.current.filter(enemy => {
      enemy.x += enemy.vx;
      enemy.y += enemy.vy;

      // Check if reached ground
      if (enemy.y > CANVAS_HEIGHT - 50) {
        damage += enemy.type === 'bomb' ? 15 : (enemy.type === 'missile' ? 10 : 5);
        createExplosion(enemy.x, enemy.y, '#ff4400', 12);
        return false;
      }

      // Check fortification collision
      for (let i = fortificationsRef.current.length - 1; i >= 0; i--) {
        const fort = fortificationsRef.current[i];
        const dx = enemy.x - fort.x;
        const dy = enemy.y - fort.y;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 25) {
          fort.hp -= 1;
          if (fort.hp <= 0) {
            createExplosion(fort.x, fort.y, '#8B4513', 10);
            fortificationsRef.current.splice(i, 1);
          }
          createExplosion(enemy.x, enemy.y, '#ffaa00', 4);
          return false;
        }
      }

      // Check bullet collision
      for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
        const b = bulletsRef.current[i];
        const dx = b.x - enemy.x;
        const dy = b.y - enemy.y;
        if (Math.abs(dx) < enemy.size + 4 && Math.abs(dy) < enemy.size + 4) {
          enemy.hp -= b.damage;
          bulletsRef.current.splice(i, 1);
          createExplosion(b.x, b.y, '#ffff00', 3);
          
          if (enemy.hp <= 0) {
            createExplosion(enemy.x, enemy.y, 
              enemy.type === 'missile' ? '#ff4400' : 
              enemy.type === 'bomb' ? '#ff8800' : '#4444ff', 10);
            setGameState(prev => ({ 
              ...prev, 
              score: prev.score + enemy.reward,
              money: prev.money + enemy.reward 
            }));
            return false;
          }
          break;
        }
      }

      return true;
    });

    if (damage > 0) {
      setGameState(prev => {
        const newHp = Math.max(0, prev.hp - damage);
        return { ...prev, hp: newHp, gameOver: newHp <= 0 };
      });
    }

    // Turret fortifications auto-fire
    fortificationsRef.current.forEach(fort => {
      if (fort.type === 'turret' && enemiesRef.current.length > 0) {
        if (Math.random() < 0.03) {
          const nearest = enemiesRef.current.reduce((closest, e) => {
            const d = Math.sqrt((e.x - fort.x) ** 2 + (e.y - fort.y) ** 2);
            return d < closest.dist ? { enemy: e, dist: d } : closest;
          }, { enemy: enemiesRef.current[0], dist: Infinity });
          
          if (nearest.dist < 200) {
            const dx = nearest.enemy.x - fort.x;
            const dy = nearest.enemy.y - fort.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            bulletsRef.current.push({
              x: fort.x,
              y: fort.y - 15,
              vx: (dx / dist) * 5,
              vy: (dy / dist) * 5,
              damage: 1,
            });
          }
        }
      }
    });

    // Update particles
    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.life--;
      return p.life > 0;
    });

    // Draw fortifications
    fortificationsRef.current.forEach(fort => drawFortification(ctx, fort));

    // Draw tower
    drawTower(ctx);

    // Draw enemies
    enemiesRef.current.forEach(enemy => drawEnemy(ctx, enemy));

    // Draw bullets
    bulletsRef.current.forEach(b => {
      drawPixelRect(ctx, b.x - 2, b.y - 2, 4, 4, '#ffff00');
      drawPixelRect(ctx, b.x - 1, b.y - 1, 2, 2, '#ffffff');
    });

    // Draw particles
    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life / 50;
      drawPixelRect(ctx, p.x - p.size/2, p.y - p.size/2, p.size, p.size, p.color);
      ctx.globalAlpha = 1;
    });

    // Wave indicator
    if (waveTimerRef.current > 0 && waveTimerRef.current < 60) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`ВОЛНА ${gameState.wave + 1} ПРИБЛИЖАЕТСЯ...`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, shoot, spawnEnemy]);

  useEffect(() => {
    enemiesInWaveRef.current = 5 + gameState.wave * 2;
  }, []);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationRef.current);
  }, [gameLoop]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;
      mouseRef.current = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;
      mouseRef.current = {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  const restartGame = () => {
    enemiesRef.current = [];
    bulletsRef.current = [];
    particlesRef.current = [];
    fortificationsRef.current = [];
    spawnTimerRef.current = 0;
    waveTimerRef.current = 0;
    enemiesSpawnedRef.current = 0;
    enemiesInWaveRef.current = 7;
    setGameState({
      score: 0,
      wave: 1,
      money: 0,
      hp: 100,
      maxHp: 100,
      gameOver: false,
      isPaused: false,
      showShop: false,
    });
    setUpgrades({
      pvoDamage: 1,
      bulletSpeed: 1,
      bulletCount: 1,
      fireRate: 1,
      fortifications: 0,
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-mono">
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold text-green-400 pixel-text tracking-wider">
          🛡️ ПВО ЗАЩИТНИК 🚀
        </h1>
        <p className="text-gray-400 text-sm mt-1">Уничтожай ракеты и боеприпасы врага!</p>
      </div>

      {/* HUD */}
      <div className="flex gap-4 mb-2 flex-wrap justify-center">
        <div className="bg-gray-800 px-3 py-1 rounded border border-gray-600">
          <span className="text-yellow-400">💰 {gameState.money}</span>
        </div>
        <div className="bg-gray-800 px-3 py-1 rounded border border-gray-600">
          <span className="text-red-400">❤️ {gameState.hp}/{gameState.maxHp}</span>
        </div>
        <div className="bg-gray-800 px-3 py-1 rounded border border-gray-600">
          <span className="text-blue-400">🌊 Волна: {gameState.wave}</span>
        </div>
        <div className="bg-gray-800 px-3 py-1 rounded border border-gray-600">
          <span className="text-green-400">⭐ {gameState.score}</span>
        </div>
      </div>

      {/* Game Canvas */}
      <div className="relative border-4 border-gray-600 rounded-lg overflow-hidden shadow-2xl shadow-green-900/20">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block cursor-crosshair max-w-full h-auto"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Game Over Overlay */}
        {gameState.gameOver && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
            <h2 className="text-4xl font-bold text-red-500 mb-4">ПОРАЖЕНИЕ</h2>
            <p className="text-xl text-white mb-2">Счёт: {gameState.score}</p>
            <p className="text-lg text-gray-300 mb-4">Волна: {gameState.wave}</p>
            <button
              onClick={restartGame}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-lg transition-colors"
            >
              🔄 Начать заново
            </button>
          </div>
        )}
      </div>

      {/* Shop & Controls */}
      <div className="mt-4 w-full max-w-[800px]">
        <div className="flex gap-2 justify-center mb-3">
          <button
            onClick={() => setGameState(prev => ({ ...prev, showShop: !prev.showShop }))}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded transition-colors"
          >
            🏪 Магазин
          </button>
          <button
            onClick={() => setGameState(prev => ({ ...prev, isPaused: !prev.isPaused }))}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded transition-colors"
          >
            {gameState.isPaused ? '▶️ Продолжить' : '⏸️ Пауза'}
          </button>
        </div>

        {gameState.showShop && (
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <UpgradeButton
              title="🎯 Урон ПВО"
              level={upgrades.pvoDamage}
              cost={getUpgradeCost('pvoDamage')}
              money={gameState.money}
              onClick={() => buyUpgrade('pvoDamage')}
              desc="Увеличивает урон снарядов"
            />
            <UpgradeButton
              title="💨 Скорость снарядов"
              level={upgrades.bulletSpeed}
              cost={getUpgradeCost('bulletSpeed')}
              money={gameState.money}
              onClick={() => buyUpgrade('bulletSpeed')}
              desc="Снаряды летят быстрее"
            />
            <UpgradeButton
              title="🔫 Кол-во снарядов"
              level={upgrades.bulletCount}
              cost={getUpgradeCost('bulletCount')}
              money={gameState.money}
              onClick={() => buyUpgrade('bulletCount')}
              desc="Больше снарядов за выстрел"
            />
            <UpgradeButton
              title="⚡ Скорострельность"
              level={upgrades.fireRate}
              cost={getUpgradeCost('fireRate')}
              money={gameState.money}
              onClick={() => buyUpgrade('fireRate')}
              desc="Быстрее стрельба"
            />
            <UpgradeButton
              title="🏗️ Укрепления"
              level={upgrades.fortifications}
              cost={getUpgradeCost('fortifications')}
              money={gameState.money}
              onClick={() => buyUpgrade('fortifications')}
              desc="Стена / Турель / Щит"
            />
            <div className="bg-gray-700 rounded p-3 flex flex-col justify-center items-center">
              <p className="text-gray-300 text-sm">Укреплений: {fortificationsRef.current.length}</p>
              <p className="text-gray-400 text-xs mt-1">🧱 Стена - блокирует</p>
              <p className="text-gray-400 text-xs">🔫 Турель - стреляет</p>
              <p className="text-gray-400 text-xs">🛡️ Щит - поглощает</p>
            </div>
          </div>
        )}
      </div>

      <p className="text-gray-500 text-xs mt-4 text-center">
        Двигай мышкой для прицеливания • Стрельба автоматическая • Зарабатывай деньги за уничтожение врагов
      </p>
    </div>
  );
}

function UpgradeButton({ title, level, cost, money, onClick, desc }: {
  title: string;
  level: number;
  cost: number;
  money: number;
  onClick: () => void;
  desc: string;
}) {
  const canAfford = money >= cost;
  return (
    <button
      onClick={onClick}
      disabled={!canAfford}
      className={`p-3 rounded border text-left transition-all ${
        canAfford 
          ? 'bg-gray-700 border-green-500 hover:bg-gray-600 hover:border-green-400 cursor-pointer' 
          : 'bg-gray-800 border-gray-600 opacity-50 cursor-not-allowed'
      }`}
    >
      <div className="text-white font-bold text-sm">{title}</div>
      <div className="text-gray-400 text-xs mt-1">{desc}</div>
      <div className="flex justify-between items-center mt-2">
        <span className="text-yellow-400 text-xs">💰 {cost}</span>
        <span className="text-blue-300 text-xs">Ур. {level}</span>
      </div>
    </button>
  );
}

export default App;
