

uniform sampler2D u_finalCostMap;     // Карта стоимости после всех итераций
uniform sampler2D u_heightMap;        // Карта высот
uniform float u_heightMapMaxVal;      // Максимальное значение высоты

uniform float u_lineSpacing;          // Шаг линий (например, 50.0)
uniform float u_lineThickness;        // Толщина линий (например, 2.0)
uniform vec3 u_lineColor;             // Цвет линий (например, vec3(0.0, 1.0, 0.8))

void main() {
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_finalCostMap, 0));

    float cost = texture2D(u_finalCostMap, uv).r;
    float height = texture2D(u_heightMap, uv).r; // Высота от 0 до 1

    // Базовый цвет ландшафта (можно использовать градиент по высоте)
    vec4 baseColor = mix(vec4(0.0, 0.2, 0.0, 1.0), vec4(0.7, 0.7, 0.7, 1.0), height); // От зеленого к серому

    // Расчет линии
    float remainder = mod(cost, u_lineSpacing);
    float intensity = 1.0 - smoothstep(0.0, u_lineThickness, remainder);

    // FragColor = mix(baseColor, vec4(u_lineColor, 1.0), intensity);
    pc_fragColor = mix(baseColor, vec4(u_lineColor, 1.0), intensity);
}