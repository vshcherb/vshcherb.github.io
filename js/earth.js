
// Some constants
const h = 1.01; // earth skew
const EarthDelta = Math.PI / 180 * 5; // up to 85 (Mercatoor projection)
const colorsNum = 32;

const CONFIG = {
    eyeDist: 0,
    cubeRotation: 0.0,
    zoom: 3,
    fieldOfView: (30 * Math.PI) / 180, // in radians
    zNear: 0.1,
    zFar: 1000,

    sides: function(){
        return 1 << CONFIG.zoom;
    }
};


main();

// input: h in [0,360] and s,v in [0,1] - output: r,g,b in [0,1]
function hsv2rgb(h, s, v, a) {
    let f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return [f(5), f(3), f(1), a];
}   

//
// Start here
//
function main() {
    const canvas = document.querySelector("#glcanvas");
    const gl =canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    // If we don't have a GL context, give up now
    if (!gl) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
    }

    // Vertex shader program
    const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec4 aVertexColor;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;

    varying lowp vec4 vColor;

    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
      vColor = aVertexColor;
    }
  `;

    // Fragment shader program

    const fsSource = `
    varying lowp vec4 vColor;

    void main(void) {
      gl_FragColor = vColor;
    }
  `;

    // Initialize a shader program; this is where all the lighting
    // for the vertices and so forth is established.
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

    // Collect all the info needed to use the shader program.
    // Look up which attributes our shader program is using
    // for aVertexPosition, aVertexColor and also
    // look up uniform locations.
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
            vertexColor: gl.getAttribLocation(shaderProgram, "aVertexColor"),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(
                shaderProgram,
                "uProjectionMatrix"
            ),
            modelViewMatrix: gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
        },
    };

    // Here's where we call the routine that builds all the
    // objects we'll be drawing.
    const buffers = initBuffers(gl);

    var then = 0;

    // Draw the scene repeatedly
    function render(now) {
        now *= 0.001; // convert to seconds
        const deltaTime = now - then;
        then = now;
        drawScene(gl, programInfo, buffers, deltaTime);
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}

//
// initBuffers
//
// Initialize the buffers we'll need. For this demo, we just
// have one object -- a simple three-dimensional cube.
//
function initBuffers(gl) {
    // Now set up the colors for the faces. We'll use solid colors
    // for each face.
    faceColors = [];
    for (var cind = 0; cind < colorsNum; cind++) {
        faceColors.push(hsv2rgb((360 / colorsNum) * cind, 0.9, 0.9, 1));
    }

    // Convert the array of colors into a table for all the vertices.
    var colors = [];

    // Create a buffer for the cube's vertex positions.
    const positionBuffer = gl.createBuffer();
    // Select the positionBuffer as the one to apply buffer
    // operations to from here out.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    var ind = 0;
    var vertCount = 0;
    // Now create an array of positions for the cube.
    var positions = [];
    // This array defines each face as two triangles, using the
    // indices into the vertex array to specify each triangle's position.
    var indices = []
    const sides = CONFIG.sides();
    const rotAngle = 2 *  Math.PI / sides; // in radians
    const rotAngleLat = (Math.PI - 2 * EarthDelta) / sides; // in radians
    
    for(var i = 0; i < sides; i++) {
        for (var j = 0; j < sides; j++) {
            // geo latitude = 90 - lat
            var latt = EarthDelta + j * rotAngleLat;
            var latb = EarthDelta + (j + 1) * rotAngleLat;
            var lonl = i * rotAngle;
            var lonr = (i + 1) * rotAngle;
            positions = positions.concat([
                Math.sin(lonl) * Math.sin(latt), Math.cos(latt), Math.cos(lonl) * Math.sin(latt),
                Math.sin(lonl) * Math.sin(latb), Math.cos(latb), Math.cos(lonl) * Math.sin(latb),
                Math.sin(lonr) * Math.sin(latt), Math.cos(latt), Math.cos(lonr) * Math.sin(latt),
                Math.sin(lonr) * Math.sin(latb), Math.cos(latb), Math.cos(lonr) * Math.sin(latb),
            ]);
            indices = indices.concat([ind, ind + 1, ind + 2, ind + 2, ind + 1, ind + 3]);
            ind += 4;
            vertCount += 6;
            const c = faceColors[((i * sides + j) * 7) % faceColors.length];
            // Repeat each color four times for the four vertices of the face
            colors = colors.concat(c, c, c, c);
        }
    }
    // TOP and bottom
    for (var j = -1; j <= 1; j += 2) {
        for (var i = 0; i < sides; i++) {
            var lonl = i * rotAngle;
            var lonr = (i + 1) * rotAngle;
            positions = positions.concat([
                0, j * h, 0,
                Math.sin(lonl) * Math.sin(EarthDelta), j * Math.cos(EarthDelta), Math.cos(lonl) * Math.sin(EarthDelta),
                Math.sin(lonr) * Math.sin(EarthDelta), j * Math.cos(EarthDelta), Math.cos(lonr) * Math.sin(EarthDelta)
            ]);
            indices = indices.concat([ind, ind + 1, ind + 2]);
            ind += 3;
            // Repeat each color 3 times for the four vertices of the face
            const c = [0.9, 0.9, 0.9, 0.9];
            colors = colors.concat(c, c, c);
            vertCount += 3;
        }
    }
    
    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    // Build the element array buffer; this specifies the indices
    // into the vertex arrays for each face's vertices.

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    // Now send the element array to GL
    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(indices),
        gl.STATIC_DRAW
    );

    return {
        verticesCount: vertCount,
        position: positionBuffer,
        color: colorBuffer,
        indices: indexBuffer,
    };
}

//
// Draw the scene.
//
function drawScene(gl, programInfo, buffers, deltaTime) {
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    gl.clearDepth(1.0); // Clear everything
    gl.enable(gl.DEPTH_TEST); // Enable depth testing
    gl.depthFunc(gl.LEQUAL); // Near things obscure far things

    // Clear the canvas before we start drawing on it.

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Create a perspective matrix, a special matrix that is
    // used to simulate the distortion of perspective in a camera.
    // Our field of view is 45 degrees, with a width/height
    // ratio that matches the display size of the canvas
    // and we only want to see objects between 0.1 units
    // and 100 units away from the camera.


    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projectionMatrix = mat4.create();

    // note: glmatrix.js always has the first argument
    // as the destination to receive the result.
   // mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
    const eye = vec3.fromValues(0, 0, -15 + Math.sin(CONFIG.eyeDist) * 4);
    CONFIG.eyeDist += deltaTime / (15 / Math.PI) ;
    const lookAt = vec3.fromValues(0, 0, 0);
    var lookAtMatrix = mat4.create();
    var perspectiveMatrix = mat4.create();
    mat4.lookAt(lookAtMatrix, eye, lookAt, vec3.fromValues(0, 1, 0));
    mat4.perspective(perspectiveMatrix, CONFIG.fieldOfView, aspect, CONFIG.zNear, CONFIG.zFar);
    mat4.multiply(projectionMatrix, lookAtMatrix, projectionMatrix);
    mat4.multiply(projectionMatrix, perspectiveMatrix, projectionMatrix);

    // Set the drawing position to the "identity" point, which is
    // the center of the scene.
    const modelViewMatrix = mat4.create();

    // Now move the drawing position a bit to where we want to
    // start drawing the square.

    mat4.translate(
        modelViewMatrix, // destination matrix
        modelViewMatrix, // matrix to translate
        [-0.0, 0.0, -6.0]
    ); // amount to translate
    // mat4.rotate(
    //     modelViewMatrix, // destination matrix
    //     modelViewMatrix, // matrix to rotate
    //     CONFIG.cubeRotation, // amount to rotate in radians
    //     [0, 0, 1]
    // ); // axis to rotate around (Z)
    mat4.rotate(
        modelViewMatrix, // destination matrix
        modelViewMatrix, // matrix to rotate
        CONFIG.cubeRotation * 0.3, // amount to rotate in radians
        [0, 1, 0]
    ); // axis to rotate around (Y)
    mat4.rotate(
        modelViewMatrix, // destination matrix
        modelViewMatrix, // matrix to rotate
        CONFIG.cubeRotation * 0.3, // amount to rotate in radians
        [1, 0, 0]
    ); // axis to rotate around (X)

    // Tell WebGL how to pull out the positions from the position
    // buffer into the vertexPosition attribute
    {
        const numComponents = 3;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexPosition,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    }

    // Tell WebGL how to pull out the colors from the color buffer
    // into the vertexColor attribute.
    {
        const numComponents = 4;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexColor,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
    }
    // Tell WebGL which indices to use to index the vertices
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
    // Tell WebGL to use our program when drawing
    gl.useProgram(programInfo.program);
    // Set the shader uniforms
    gl.uniformMatrix4fv(
        programInfo.uniformLocations.projectionMatrix,
        false,
        projectionMatrix
    );
    gl.uniformMatrix4fv(
        programInfo.uniformLocations.modelViewMatrix,
        false,
        modelViewMatrix
    );
    {
        const type = gl.UNSIGNED_SHORT;
        const offset = 0;
        gl.drawElements(gl.TRIANGLES, buffers.verticesCount, type, offset);
    }
    // Update the rotation for the next draw
    CONFIG.cubeRotation += deltaTime;
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    // Create the shader program

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    // If creating the shader program failed, alert

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert(
            "Unable to initialize the shader program: " +
            gl.getProgramInfoLog(shaderProgram)
        );
        return null;
    }

    return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    // Send the source to the shader object

    gl.shaderSource(shader, source);

    // Compile the shader program

    gl.compileShader(shader);

    // See if it compiled successfully

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(
            "An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader)
        );
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function updateUIParameter(prefix, idInput, idLabel) {

}

function addListeners() {
    var quality = document.getElementById('quality');
    quality.addEventListener('change', function (e) { return app.SetQuality(quality.options[quality.selectedIndex].value); });
    var sliderZoom = document.getElementById('sliderZoom');
    sliderZoom.value = app.GetZoom().toString();
    sliderZoom.addEventListener('input', function () { 
        return app.SetRotation(sliderX.getAttribute('data-axis'), parseFloat(sliderX.value)); 
    });
}