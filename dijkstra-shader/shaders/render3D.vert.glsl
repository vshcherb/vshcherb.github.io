uniform sampler2D u_heightMap;
uniform float u_heightMapMaxVal;
uniform vec2 u_mapSize; // Размер карты в мире (например, 256, 256)

out vec2 v_uv;
out float v_worldHeight;

void main() {
    v_uv = uv; // Стандартные UV координаты из геометрии Three.js

    // Получаем высоту из текстуры (0-1) и масштабируем до реальных метров
    float heightSample = texture2D(u_heightMap, uv).r;
    v_worldHeight = heightSample * u_heightMapMaxVal;

    // Смещаем вершину по Y для создания 3D рельефа
    // position - это изначальные координаты плоскости Three.js
    // Мы можем масштабировать X/Z, чтобы карта была по центру.
    vec3 transformedPosition = vec3(position.x * u_mapSize.x, v_worldHeight, position.y * u_mapSize.y);
    
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(transformedPosition, 1.0);
}