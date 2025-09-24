uniform sampler2D u_costMap;       // Входная карта стоимости с предыдущей итерации
uniform sampler2D u_heightMap;     // Карта высот
uniform float u_heightMapMaxVal;   // Максимальное значение реальной высоты (для нормализации)
uniform vec2 u_pixelSize;          // Размер одного пикселя текстуры (1.0 / SIZE)

uniform float u_scaleUp;           // Штраф за подъем
uniform float u_scaleDown;         // Штраф за спуск
uniform float u_horizontalCost;    // Штраф за горизонтальное перемещение (по умолчанию 1.0)

void main() {
    vec2 uv = gl_FragCoord.xy * u_pixelSize; // Текущие UV координаты

    float currentCost = texture2D(u_costMap, uv).r; // Текущая накопленная стоимость
    float currentHeight = texture2D(u_heightMap, uv).r * u_heightMapMaxVal;

    float minNeighborCost = currentCost; // Начнем с текущей стоимости

    // Перебираем 8 соседей (3x3 область)
    for (int y_offset = -1; y_offset <= 1; ++y_offset) {
        for (int x_offset = -1; x_offset <= 1; ++x_offset) {
            if (x_offset == 0 && y_offset == 0) continue; // Пропускаем сам пиксель

            vec2 neighborUV = uv + vec2(float(x_offset), float(y_offset)) * u_pixelSize;
            float neighborCost = texture2D(u_costMap, neighborUV).r;
            float neighborHeight = texture2D(u_heightMap, neighborUV).r * u_heightMapMaxVal;

            float height_diff = currentHeight - neighborHeight;
            float vertical_cost = 0.0;
            if (height_diff > 0.0) { // Идем вверх (от соседа к себе)
                vertical_cost = height_diff * u_scaleUp;
            } else { // Идем вниз или по горизонтали
                vertical_cost = abs(height_diff) * u_scaleDown;
            }

            // Штраф за горизонтальное перемещение:
            // - 1.0 для прямых соседей (вправо, влево, вверх, вниз)
            // - sqrt(2) для диагональных
            float dist_mult = (abs(x_offset) + abs(y_offset) == 2) ? 1.41421356 : 1.0; // sqrt(2)
            float total_cost_to_neighbor = neighborCost + u_horizontalCost * dist_mult + vertical_cost;

            minNeighborCost = min(minNeighborCost, total_cost_to_neighbor);
        }
    }
    
    // Записываем минимальную найденную стоимость
    gl_FragColor = vec4(minNeighborCost, 0.0, 0.0, 1.0);
}