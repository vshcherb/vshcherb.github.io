uniform vec2 u_startPoint; // Начальная точка (0-1)
uniform float u_infinity;  // Очень большое число
uniform vec2 u_resolution;

void main() {
    // Получаем координаты пикселя в текстуре (0-1)
    // vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_infinity, 0));
    vec2 uv = gl_FragCoord.xy / u_resolution;

    // Если текущий пиксель - это стартовая точка, устанавливаем 0, иначе - бесконечность
    if (distance(uv, u_startPoint) < 0.5 / u_resolution.x) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        gl_FragColor = vec4(u_infinity, 0.0, 0.0, 1.0);
    }
}