/*
 * Copyright Olli Etuaho 2012-2013.
 */

'use strict';

var glUtils = {
    createTexture: null,
    initGl: null,
    supportsTextureUnits: null,
    updateClip: null,
    glSupported: true, // these values will be updated later
    availableExtensions: [],
    floatFboSupported: true,
    maxVaryingVectors: 8, // minimum mandated by the spec
    maxUniformVectors: 16, // minimum mandated by the spec for the fragment shader
    maxTextureUnits: 32,
    maxFramebufferSize: 2048
};

/**
 * Create a WebGL context on a canvas element.
 * @param {HTMLCanvasElement} canvas The canvas element.
 * @param {Object} contextAttribs The context attributes to pass to the created
 * context.
 * @param {number=} minTextureUnits The required amount of texture units. Must
 * be an integer. Defaults to 0.
 * @return {WebGLRenderingContext} The created context or null if unable to
 * create one filling the requirements.
 */
glUtils.initGl = function(canvas, contextAttribs, minTextureUnits) {
    if (minTextureUnits === undefined) {
        minTextureUnits = 0;
    }
    if (!glUtils.supportsTextureUnits(minTextureUnits)) {
        return null;
    }
    var gl = null;
    try {
        // Try to grab the standard context, or fallback to experimental.
        gl = canvas.getContext('webgl', contextAttribs) ||
             canvas.getContext('experimental-webgl', contextAttribs);
    } catch (e) {
        gl = null;
    }
    gl.enableVertexAttribArray(0);
    return gl;
};

/**
 * @param {number} unitCount The amount of texture units required. Must be an
 * integer.
 * @return {boolean} Is it possible to create a WebGL context with the given
 * amount of texture units.
 */
glUtils.supportsTextureUnits = function(unitCount) {
    return glUtils.glSupported === true && glUtils.maxTextureUnits >= unitCount;
};

/**
 * Update the scissor rectangle to a rectangle in the canvas2d coordinate
 * system.
 * @param {WebGLRenderingContext} gl The WebGL context.
 * @param {Rect} rect The rectangle to use as scissor. In canvas2d coordinate
 * system, as in y 0 is the top of the canvas.
 * @param {number} fbHeight The framebuffer height.
 */
glUtils.updateClip = function(gl, rect, fbHeight) {
    var br = rect.getXYWHRoundedOut();
    br.y = fbHeight - (br.y + br.h);
    gl.scissor(br.x, br.y, br.w, br.h);
};


/**
 * Create a manager for WebGL context state, such as switching the framebuffer.
 * @param {WebGLRenderingContext} gl The WebGL context.
 * @return {Object} The manager object.
 */
var glStateManager = function(gl) {
    var sharedFbo = gl.createFramebuffer();
    var fboInUse = null;
    var sharedFboTex = null;

    var unitQuadVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, unitQuadVertexBuffer);
    var vertices = [
        1.0, 1.0,
        -1.0, 1.0,
        1.0, -1.0,
        -1.0, -1.0
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    var unitQuadTexCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, unitQuadTexCoordBuffer);
    var texCoords = [
        1.0, 1.0,
        0.0, 1.0,
        1.0, 0.0,
        0.0, 0.0
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

    var useQuadPositionBufferInternal = function(attribLocation) {
        if (attribLocation === undefined) {
            attribLocation = 0;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, unitQuadVertexBuffer);
        gl.vertexAttribPointer(attribLocation, 2, gl.FLOAT, false, 0, 0);
    };
    
    var useQuadTexCoordBufferInternal = function(attribLocation) {
        if (attribLocation === undefined) {
            attribLocation = 1;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, unitQuadTexCoordBuffer);
        gl.vertexAttribPointer(attribLocation, 2, gl.FLOAT, false, 0, 0);
    };

    var drawQuadInternal = function(program, uniforms) {
        program.use(uniforms);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    var useFboInternal = function(fbo) {
        if (fboInUse !== fbo) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            fboInUse = fbo;
        }
    };
    var useFboTexInternal = function(tex) {
        useFboInternal(sharedFbo);
        if (sharedFboTex !== tex) {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            sharedFboTex = tex;
        }
    };

    return {
        shaderProgram: ShaderProgram.createCache(gl),
        useQuadPositionBuffer: useQuadPositionBufferInternal,
        useQuadTexCoordBuffer: useQuadTexCoordBufferInternal,
        drawQuad: drawQuadInternal,
        useFbo: useFboInternal,
        useFboTex: useFboTexInternal
    };
};

// Perform a feature test.
(function() {
    var testCanvas = document.createElement('canvas');
    var gl = glUtils.initGl(testCanvas, {});
    if (!gl) {
        glUtils.glSupported = false;
        return;
    }
    glUtils.availableExtensions = gl.getSupportedExtensions();
    console.log(glUtils.availableExtensions);

    var extensionTextureFloat = gl.getExtension('OES_texture_float');
    if (!extensionTextureFloat) {
        glUtils.floatFboSupported = false;
    } else {
        // It's possible that float textures are supported but float FBOs are not.
        var testFbo = gl.createFramebuffer();
        var testTex = textureUtil.createTexture(gl, 128, 128, gl.RGBA, gl.FLOAT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, testFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, testTex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            glUtils.floatFboSupported = false;
        }
    }

    glUtils.maxUniformVectors = Math.min(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
                                         gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS));
    console.log(glUtils.maxUniformVectors);
    glUtils.maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    if (typeof ShaderProgram != 'undefined') {
        ShaderProgram.maxTextureUnits = glUtils.maxTextureUnits;
    }
    // Do a best effort at determining framebuffer size limits:
    var maxFramebufferSizes = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    glUtils.maxFramebufferSize = Math.min(maxFramebufferSizes[0],
                                          maxFramebufferSizes[1]);
    glUtils.maxFramebufferSize =
        Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),
                 glUtils.maxFramebufferSize);
    // Memory limits are an issue, so additionally limit to 2048 at least for
    // now...
    glUtils.maxFramebufferSize = Math.min(2048, glUtils.maxFramebufferSize);
})();

glUtils.matrixInverse = function(matrix, result) {
  result = result || new Float32Array(16);
  var m = matrix, r = result;

  r[0] = m[5]*m[10]*m[15] - m[5]*m[14]*m[11] - m[6]*m[9]*m[15] + m[6]*m[13]*m[11] + m[7]*m[9]*m[14] - m[7]*m[13]*m[10];
  r[1] = -m[1]*m[10]*m[15] + m[1]*m[14]*m[11] + m[2]*m[9]*m[15] - m[2]*m[13]*m[11] - m[3]*m[9]*m[14] + m[3]*m[13]*m[10];
  r[2] = m[1]*m[6]*m[15] - m[1]*m[14]*m[7] - m[2]*m[5]*m[15] + m[2]*m[13]*m[7] + m[3]*m[5]*m[14] - m[3]*m[13]*m[6];
  r[3] = -m[1]*m[6]*m[11] + m[1]*m[10]*m[7] + m[2]*m[5]*m[11] - m[2]*m[9]*m[7] - m[3]*m[5]*m[10] + m[3]*m[9]*m[6];

  r[4] = -m[4]*m[10]*m[15] + m[4]*m[14]*m[11] + m[6]*m[8]*m[15] - m[6]*m[12]*m[11] - m[7]*m[8]*m[14] + m[7]*m[12]*m[10];
  r[5] = m[0]*m[10]*m[15] - m[0]*m[14]*m[11] - m[2]*m[8]*m[15] + m[2]*m[12]*m[11] + m[3]*m[8]*m[14] - m[3]*m[12]*m[10];
  r[6] = -m[0]*m[6]*m[15] + m[0]*m[14]*m[7] + m[2]*m[4]*m[15] - m[2]*m[12]*m[7] - m[3]*m[4]*m[14] + m[3]*m[12]*m[6];
  r[7] = m[0]*m[6]*m[11] - m[0]*m[10]*m[7] - m[2]*m[4]*m[11] + m[2]*m[8]*m[7] + m[3]*m[4]*m[10] - m[3]*m[8]*m[6];

  r[8] = m[4]*m[9]*m[15] - m[4]*m[13]*m[11] - m[5]*m[8]*m[15] + m[5]*m[12]*m[11] + m[7]*m[8]*m[13] - m[7]*m[12]*m[9];
  r[9] = -m[0]*m[9]*m[15] + m[0]*m[13]*m[11] + m[1]*m[8]*m[15] - m[1]*m[12]*m[11] - m[3]*m[8]*m[13] + m[3]*m[12]*m[9];
  r[10] = m[0]*m[5]*m[15] - m[0]*m[13]*m[7] - m[1]*m[4]*m[15] + m[1]*m[12]*m[7] + m[3]*m[4]*m[13] - m[3]*m[12]*m[5];
  r[11] = -m[0]*m[5]*m[11] + m[0]*m[9]*m[7] + m[1]*m[4]*m[11] - m[1]*m[8]*m[7] - m[3]*m[4]*m[9] + m[3]*m[8]*m[5];

  r[12] = -m[4]*m[9]*m[14] + m[4]*m[13]*m[10] + m[5]*m[8]*m[14] - m[5]*m[12]*m[10] - m[6]*m[8]*m[13] + m[6]*m[12]*m[9];
  r[13] = m[0]*m[9]*m[14] - m[0]*m[13]*m[10] - m[1]*m[8]*m[14] + m[1]*m[12]*m[10] + m[2]*m[8]*m[13] - m[2]*m[12]*m[9];
  r[14] = -m[0]*m[5]*m[14] + m[0]*m[13]*m[6] + m[1]*m[4]*m[14] - m[1]*m[12]*m[6] - m[2]*m[4]*m[13] + m[2]*m[12]*m[5];
  r[15] = m[0]*m[5]*m[10] - m[0]*m[9]*m[6] - m[1]*m[4]*m[10] + m[1]*m[8]*m[6] + m[2]*m[4]*m[9] - m[2]*m[8]*m[5];

  var det = m[0]*r[0] + m[1]*r[4] + m[2]*r[8] + m[3]*r[12];
  for (var i = 0; i < 16; i++) r[i] /= det;
  return result;
};
