

uniform sampler2D u_finalCostMap;
uniform sampler2D u_heightMap; // Может не использоваться, если цвет из v_uv
uniform float u_heightMapMaxVal;

uniform float u_lineSpacing;
uniform float u_lineThickness;
uniform vec3 u_lineColor;

in vec2 v_uv; // UV координаты, интерполированные из вершинного шейдера
in float v_worldHeight; // Высота в мировых координатах

void main() {
    float cost = texture2D(u_finalCostMap, v_uv).r;
    
    // Базовый цвет рельефа (можно использовать по V_worldHeight)
    vec4 baseColor = mix(vec4(0.0, 0.2, 0.0, 1.0), vec4(0.7, 0.7, 0.7, 1.0), v_worldHeight / u_heightMapMaxVal);

    // Расчет линии
    float remainder = mod(cost, u_lineSpacing);
    float intensity = 1.0 - smoothstep(0.0, u_lineThickness, remainder);

    // FragColor = mix(baseColor, vec4(u_lineColor, 1.0), intensity);
    pc_fragColor = mix(baseColor, vec4(u_lineColor, 1.0), intensity);

    // Можно добавить освещение для 3D
    // vec3 normal = normalize(cross(dFdx(vec3(gl_FragCoord)), dFdy(vec3(gl_FragCoord)))); // Примерно
    // float light = dot(normal, normalize(vec3(0.5, 0.8, 0.2)));
    // FragColor = FragColor * light + 0.1;
}