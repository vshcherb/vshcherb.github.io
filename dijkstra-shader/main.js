// main.js

const fileInput = document.getElementById('geotiffInput');

fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) {
        return; // Пользователь ничего не выбрал
    }

    console.log(`Загружается файл: ${file.name}`);

    const reader = new FileReader();

    // Когда файл будет прочитан, сработает эта функция
    reader.onload = async (e) => {
        const arrayBuffer = e.target.result; // Данные файла в виде ArrayBuffer

        try {
            // 1. Парсим TIF с помощью geotiff.js
            const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
            const image = await tiff.getImage(); // Получаем первое изображение из файла
            const width = image.getWidth();
            const height = image.getHeight();
            
            // 2. Читаем данные о высоте (растр)
            // readRasters вернет массив данных. Нам нужен первый канал (band).
            const data = await image.readRasters({
                window: [0, 0, width, height]
            });

            // Убедимся, что данные в формате Float32, как ожидает Three.js
            const float32Data = new Float32Array(data[0]);

            console.log(`Файл успешно прочитан. Размер: ${width}x${height}`);

            // 3. Создаем новую текстуру для Three.js
            const newHeightmapTexture = new THREE.DataTexture(
                float32Data,
                width,
                height,
                THREE.RedFormat, // Одноканальная текстура (только высота)
                THREE.FloatType
            );
            newHeightmapTexture.needsUpdate = true;
            
            // 4. Обновляем все материалы, которые используют карту высот
            // и запускаем полный перерасчет
            updateHeightmap(newHeightmapTexture);

        } catch (error) {
            console.error("Ошибка при чтении GeoTIFF файла:", error);
            alert("Не удалось прочитать GeoTIFF файл. Убедитесь, что это корректный файл высот.");
        }
    };

    // Запускаем чтение файла
    reader.readAsArrayBuffer(file);
});


// Функция для обновления карты высот во всем приложении
function updateHeightmap(newTexture) {
    // Удаляем старую текстуру, если она была, чтобы освободить память
    if (waveMaterial.uniforms.u_heightMap.value) {
        waveMaterial.uniforms.u_heightMap.value.dispose();
    }
    
    // Обновляем uniform-ы во всех материалах
    waveMaterial.uniforms.u_heightMap.value = newTexture;
    render2DMaterial.uniforms.u_heightMap.value = newTexture;
    render3DMaterial.uniforms.u_heightMap.value = newTexture;
    
    // TODO: Здесь нужно будет обновить u_heightMapMaxVal и другие
    // зависимые параметры, если они не вычисляются автоматически.
    // Например, можно найти максимальное значение в float32Data и установить его.

    console.log("Карта высот обновлена. Запускаю перерасчет волны.");
    startPointNeedsUpdate = true; // Устанавливаем флаг для перерасчета
}

// Генерируем простую карту высот (512x512)
function generateHeightmap(size) {
    const data = new Float32Array(size * size);
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const x = i / size;
            const y = j / size;
            // Простой шум для создания рельефа
            let height = Math.sin(x * Math.PI * 8) * Math.cos(y * Math.PI * 8) * 0.1;
            height += Math.sin(x * Math.PI * 16) * Math.cos(y * Math.PI * 16) * 0.05;
            height += (Math.sin(x * Math.PI * 4) + Math.cos(y * Math.PI * 4)) * 0.1;
            height = (height + 1.0) / 2.0; // Нормализация от 0 до 1
            data[j * size + i] = height;
        }
    }
    return new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.FloatType);
}

const HEIGHTMAP_SIZE = 256; // Размер нашей карты (например, 256x256)
const heightmapTexture = generateHeightmap(HEIGHTMAP_SIZE);
heightmapTexture.needsUpdate = true;

// Максимальная высота для нормализации (если heightmapTexture уже от 0 до 1)
// Можно задать реальные значения, если загружаете TIF.
const MAX_REAL_HEIGHT = 100.0; // Например, карта высот от 0 до 100 метров

// main.js (продолжение)

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); // Для 2D рендеринга в текстуру
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Камера для финального рендеринга (может быть ортографической или перспективной)
let finalCamera;
let orbitControls;

// Переключение 2D/3D камеры
function setupCamera(mode) {
    if (finalCamera) scene.remove(finalCamera);

    if (mode === '2D') {
        finalCamera = new THREE.OrthographicCamera(
            -window.innerWidth / 2, window.innerWidth / 2,
            window.innerHeight / 2, -window.innerHeight / 2,
            0.1, 1000
        );
        finalCamera.position.z = 10;
        finalCamera.lookAt(0, 0, 0);
        if (orbitControls) orbitControls.dispose(); // Отключаем OrbitControls для 2D
        orbitControls = null;
    } else { // 3D
        finalCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        finalCamera.position.set(HEIGHTMAP_SIZE / 2, HEIGHTMAP_SIZE / 2, HEIGHTMAP_SIZE); // Взгляд сверху
        finalCamera.lookAt(HEIGHTMAP_SIZE / 2, HEIGHTMAP_SIZE / 2, 0);
        orbitControls = new THREE.OrbitControls(finalCamera, renderer.domElement);
        orbitControls.enablePan = true;
        orbitControls.enableZoom = true;
        orbitControls.enableRotate = true;
    }
    scene.add(finalCamera);
}
setupCamera('2D'); // Инициализация 2D по умолчанию

// Обработка изменения размера окна
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (finalCamera instanceof THREE.OrthographicCamera) {
        finalCamera.left = -window.innerWidth / 2;
        finalCamera.right = window.innerWidth / 2;
        finalCamera.top = window.innerHeight / 2;
        finalCamera.bottom = -window.innerHeight / 2;
        finalCamera.updateProjectionMatrix();
    } else if (finalCamera instanceof THREE.PerspectiveCamera) {
        finalCamera.aspect = window.innerWidth / window.innerHeight;
        finalCamera.updateProjectionMatrix();
    }
});


// Создание двух FBO для пинг-понга
const targetA = new THREE.WebGLRenderTarget(HEIGHTMAP_SIZE, HEIGHTMAP_SIZE, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RedFormat,
    type: THREE.FloatType, // Очень важно для хранения float значений
    depthBuffer: false,
    stencilBuffer: false
});
const targetB = targetA.clone(); // Копируем настройки



// Плоскость, на которой будем рендерить
const quadGeometry = new THREE.PlaneGeometry(2, 2); // Полноэкранный квад
const quadMaterial = new THREE.ShaderMaterial(); // Будет обновляться шейдерами
const quad = new THREE.Mesh(quadGeometry, quadMaterial);
scene.add(quad); // Добавляем в сцену, но он будет невидим, пока не рендерим в FBO


// main.js (продолжение после инициализации Three.js и FBOs)

// --- Загрузка шейдеров ---
// В реальном проекте вы бы загружали эти файлы асинхронно
// Для прототипа можно встроить прямо в JS строки
const shaders = {};
async function loadShaders() {
    const fetchShader = async (name) => {
        const response = await fetch(`shaders/${name}.glsl`); // Предполагаем .glsl
        return response.text();
    };
    shaders.init_frag = await fetchShader('init.frag');
    shaders.wave_frag = await fetchShader('wave.frag');
    shaders.render_vert = await fetchShader('render.vert');
    shaders.render2D_frag = await fetchShader('render2D.frag');
    shaders.render3D_frag = await fetchShader('render3D.frag');
    shaders.render3D_vert = await fetchShader('render3D.vert');
}

// --- Материалы для разных этапов ---
const initMaterial = new THREE.ShaderMaterial({
    vertexShader: shaders.render_vert, // Тот же простой vert
    fragmentShader: shaders.init_frag,
    uniforms: {
        u_startPoint: { value: new THREE.Vector2(0.5, 0.5) },
        u_infinity: { value: 1e10 }, // Очень большое число
        u_resolution: { value: new THREE.Vector2(HEIGHTMAP_SIZE, HEIGHTMAP_SIZE) }
    }
});

const waveMaterial = new THREE.ShaderMaterial({
    vertexShader: shaders.render_vert,
    fragmentShader: shaders.wave_frag,
    uniforms: {
        u_costMap: { value: null }, // Будет обновляться
        u_heightMap: { value: heightmapTexture },
        u_heightMapMaxVal: { value: MAX_REAL_HEIGHT },
        u_pixelSize: { value: new THREE.Vector2(1.0 / HEIGHTMAP_SIZE, 1.0 / HEIGHTMAP_SIZE) },
        u_scaleUp: { value: 1.0 },
        u_scaleDown: { value: 0.0 },
        u_horizontalCost: { value: 1.0 }
    }
});

const render2DMaterial = new THREE.ShaderMaterial({
    vertexShader: shaders.render_vert,
    fragmentShader: shaders.render2D_frag,
    uniforms: {
        u_finalCostMap: { value: null }, // Будет обновляться
        u_heightMap: { value: heightmapTexture },
        u_heightMapMaxVal: { value: MAX_REAL_HEIGHT },
        u_lineSpacing: { value: 50.0 },
        u_lineThickness: { value: 2.0 },
        u_lineColor: { value: new THREE.Color(0.0, 1.0, 0.8) }
    }
});

const render3DMaterial = new THREE.ShaderMaterial({
    vertexShader: shaders.render3D_vert,
    fragmentShader: shaders.render3D_frag,
    uniforms: {
        u_finalCostMap: { value: null },
        u_heightMap: { value: heightmapTexture },
        u_heightMapMaxVal: { value: MAX_REAL_HEIGHT },
        u_lineSpacing: { value: 50.0 },
        u_lineThickness: { value: 2.0 },
        u_lineColor: { value: new THREE.Color(0.0, 1.0, 0.8) },
        u_mapSize: { value: new THREE.Vector2(HEIGHTMAP_SIZE, HEIGHTMAP_SIZE) }
    }
});

// --- PING-PONG логика ---
let currentReadTarget = targetA;
let currentWriteTarget = targetB;

function swapTargets() {
    [currentReadTarget, currentWriteTarget] = [currentWriteTarget, currentReadTarget];
}

let waveCalculated = false;
let startPointNeedsUpdate = true;
let waveIterations = 500;

function calculateWave() {
    startPointNeedsUpdate = false; // Сбросим флаг после начала расчета

    // 1. Инициализация (записываем в currentWriteTarget)
    quad.material = initMaterial;
    renderer.setRenderTarget(currentWriteTarget);
    renderer.render(quad, camera);
    swapTargets(); // Теперь initMaterial был записан в currentReadTarget

    // 2. Распространение волны
    quad.material = waveMaterial;
    for (let i = 0; i < waveIterations; i++) {
        waveMaterial.uniforms.u_costMap.value = currentReadTarget.texture;
        renderer.setRenderTarget(currentWriteTarget);
        renderer.render(quad, camera);
        swapTargets();
    }

    renderer.setRenderTarget(null); // Возвращаемся к рендерингу на экран
    waveCalculated = true;
    console.log(`Волна рассчитана за ${waveIterations} итераций.`);
}

// --- Обработка UI ---
// Ссылки на элементы управления
const mode2D = document.getElementById('mode2D');
const mode3D = document.getElementById('mode3D');
const startPointX = document.getElementById('startPointX');
const startPointY = document.getElementById('startPointY');
const scaleUp = document.getElementById('scaleUp');
const scaleDown = document.getElementById('scaleDown');
const lineSpacing = document.getElementById('lineSpacing');
const lineThickness = document.getElementById('lineThickness');
const waveIterationsInput = document.getElementById('waveIterations');
const recalculateWaveBtn = document.getElementById('recalculateWave');

// Обновление значений в UI
document.querySelectorAll('input[type="range"]').forEach(input => {
    const valSpan = document.getElementById(input.id + '_val');
    if (valSpan) {
        input.addEventListener('input', () => {
            valSpan.textContent = input.value;
        });
    }
});

// Слушатели событий
mode2D.addEventListener('change', () => setupCamera('2D'));
mode3D.addEventListener('change', () => setupCamera('3D'));

startPointX.addEventListener('input', () => {
    initMaterial.uniforms.u_startPoint.value.x = parseFloat(startPointX.value);
    startPointNeedsUpdate = true;
});
startPointY.addEventListener('input', () => {
    initMaterial.uniforms.u_startPoint.value.y = parseFloat(startPointY.value);
    startPointNeedsUpdate = true;
});

document.getElementById('resetStartPoint').addEventListener('click', () => {
    startPointX.value = 0.5;
    startPointY.value = 0.5;
    startPointX.dispatchEvent(new Event('input')); // Обновить UI и значение
    startPointY.dispatchEvent(new Event('input'));
});

scaleUp.addEventListener('input', () => {
    waveMaterial.uniforms.u_scaleUp.value = parseFloat(scaleUp.value);
    startPointNeedsUpdate = true; // Изменение штрафов требует перерасчета волны
});
scaleDown.addEventListener('input', () => {
    waveMaterial.uniforms.u_scaleDown.value = parseFloat(scaleDown.value);
    startPointNeedsUpdate = true;
});

lineSpacing.addEventListener('input', () => {
    render2DMaterial.uniforms.u_lineSpacing.value = parseFloat(lineSpacing.value);
    render3DMaterial.uniforms.u_lineSpacing.value = parseFloat(lineSpacing.value);
});
lineThickness.addEventListener('input', () => {
    render2DMaterial.uniforms.u_lineThickness.value = parseFloat(lineThickness.value);
    render3DMaterial.uniforms.u_lineThickness.value = parseFloat(lineThickness.value);
});

waveIterationsInput.addEventListener('change', () => {
    waveIterations = parseInt(waveIterationsInput.value);
    startPointNeedsUpdate = true;
});
recalculateWaveBtn.addEventListener('click', () => {
    startPointNeedsUpdate = true;
});


// Клик мышью для выбора стартовой точки
renderer.domElement.addEventListener('click', (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) / rect.width;
    const mouseY = 1.0 - (event.clientY - rect.top) / rect.height; // WebGL Y-axis is inverted for mouse

    // Обновляем uniform и флаг для перерасчета
    initMaterial.uniforms.u_startPoint.value.set(mouseX, mouseY);
    startPointX.value = mouseX.toFixed(2); // Обновить UI
    startPointY.value = mouseY.toFixed(2);
    document.getElementById('startPointX_val').textContent = mouseX.toFixed(2);
    document.getElementById('startPointY_val').textContent = mouseY.toFixed(2);

    startPointNeedsUpdate = true;
});

// --- Главный цикл рендеринга ---
function animate() {
    requestAnimationFrame(animate);

    if (startPointNeedsUpdate) {
        calculateWave();
    }

    // Финальный рендеринг на экран
    if (waveCalculated) {
        if (mode2D.checked) {
            quad.material = render2DMaterial;
            render2DMaterial.uniforms.u_finalCostMap.value = currentReadTarget.texture;
            // Убедимся, что квад отображает всю карту
            quad.scale.set(window.innerWidth / HEIGHTMAP_SIZE, window.innerHeight / HEIGHTMAP_SIZE, 1);
            quad.position.set(0, 0, 0); // Центрируем квад
            renderer.render(quad, finalCamera);
        } else { // 3D режим
            // В 3D режиме мы рендерим mesh, который уже деформирован
            // Вместо полноэкранного квада создадим сетку
            // Это требует создания нового Mesh с plane geometry
            // и применения render3DMaterial
            // Для простоты, сделаем 3D сетку один раз.
            if (!terrainMesh) {
                 const terrainGeometry = new THREE.PlaneGeometry(HEIGHTMAP_SIZE, HEIGHTMAP_SIZE, HEIGHTMAP_SIZE - 1, HEIGHTMAP_SIZE - 1); // Создаем много полигонов
                 terrainMesh = new THREE.Mesh(terrainGeometry, render3DMaterial);
                 terrainMesh.rotation.x = -Math.PI / 2; // Развернуть плоскость горизонтально
                 terrainMesh.position.set(0, -MAX_REAL_HEIGHT/2, 0); // Центрировать по Y
                 scene.add(terrainMesh);
            }
            // Обновляем uniform-ы для 3D материала
            render3DMaterial.uniforms.u_finalCostMap.value = currentReadTarget.texture;
            render3DMaterial.uniforms.u_mapSize.value.set(HEIGHTMAP_SIZE, HEIGHTMAP_SIZE);
            renderer.render(scene, finalCamera);
        }
    }

    if (orbitControls) orbitControls.update();
}

let terrainMesh = null; // Для хранения 3D меша

// Запускаем всё
loadShaders().then(() => {
    // После загрузки шейдеров, инициализируем материалы и запускаем анимацию
    initMaterial.vertexShader = shaders.render_vert;
    initMaterial.fragmentShader = shaders.init_frag;
    initMaterial.needsUpdate = true;

    waveMaterial.vertexShader = shaders.render_vert;
    waveMaterial.fragmentShader = shaders.wave_frag;
    waveMaterial.needsUpdate = true;

    render2DMaterial.vertexShader = shaders.render_vert;
    render2DMaterial.fragmentShader = shaders.render2D_frag;
    render2DMaterial.needsUpdate = true;

    render3DMaterial.vertexShader = shaders.render3D_vert;
    render3DMaterial.fragmentShader = shaders.render3D_frag;
    render3DMaterial.needsUpdate = true;

    animate();
    calculateWave(); // Изначальный расчет
});