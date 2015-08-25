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
    maxFramebufferSize: 2048,
    textureUnits: null
};

/**
 * Create a texture and initialize it to use gl.NEAREST filtering and
 * gl.CLAMP_TO_EDGE clamping.
 * @param {WebGLRenderingContext} gl The WebGL context.
 * @param {number} width Width of the texture. Must be an integer.
 * @param {number} height Height of the texture. Must be an integer.
 * @param {GLenum=} format Texture format. Defaults to gl.RGBA.
 * @param {GLenum=} type Texture type. Defaults to gl.UNSIGNED_BYTE.
 * @return {WebGLTexture} The created texture.
 */
glUtils.createTexture = function(gl, width, height, format, type) {
    if (format === undefined) {
        format = gl.RGBA;
    }
    if (type === undefined) {
        type = gl.UNSIGNED_BYTE;
    }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, format, type,
                  null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
};

/**
 * @return {function} Filter to create a GL texture from a Sprite.
 */
Sprite.loadAsGLTexture = function(gl) {
    return function(sprite) {
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sprite.img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        sprite.texture = tex;
    };
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

    var useQuadVertexBufferInternal = function(useTexCoordBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, unitQuadVertexBuffer);
        var positionAttribLocation = 0;
        gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);
        if (useTexCoordBuffer === true) {
            var texCoordAttribLocation = 1;
            gl.bindBuffer(gl.ARRAY_BUFFER, unitQuadTexCoordBuffer);
            gl.vertexAttribPointer(texCoordAttribLocation, 2, gl.FLOAT, false, 0, 0);
        }
    };

    var drawFullscreenQuadInternal = function(program, uniforms) {
        program.use(uniforms);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    var drawRectInternal = function(program, uniforms, rect) {
        if (rect !== undefined) {
            uniforms['uScale'] = [rect.width() / gl.drawingBufferWidth, rect.height() / gl.drawingBufferHeight];
            // Without any translation, the scaled rect would be centered in the gl viewport.
            // uTranslate = rect center point in gl coordinates.
            var rectCenter = new Vec2(rect.left + rect.width() * 0.5, rect.top + rect.height() * 0.5);
            rectCenter.x = (rectCenter.x / gl.drawingBufferWidth) * 2 - 1;
            rectCenter.y = (1 - rectCenter.y / gl.drawingBufferHeight) * 2 - 1;
            uniforms['uTranslate'] = [rectCenter.x, rectCenter.y];
        }
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
        useQuadVertexBuffer: useQuadVertexBufferInternal,
        drawFullscreenQuad: drawFullscreenQuadInternal,
        drawRect: drawRectInternal,
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
        var testTex = glUtils.createTexture(gl, 128, 128, gl.RGBA, gl.FLOAT);
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
    glUtils.textureUnits = [gl.TEXTURE0, gl.TEXTURE1, gl.TEXTURE2, gl.TEXTURE3,
                            gl.TEXTURE4, gl.TEXTURE5, gl.TEXTURE6, gl.TEXTURE7,
                            gl.TEXTURE8, gl.TEXTURE9, gl.TEXTURE10,
                            gl.TEXTURE11, gl.TEXTURE12, gl.TEXTURE13,
                            gl.TEXTURE14, gl.TEXTURE15, gl.TEXTURE16,
                            gl.TEXTURE17, gl.TEXTURE18, gl.TEXTURE19,
                            gl.TEXTURE20, gl.TEXTURE21, gl.TEXTURE22,
                            gl.TEXTURE23, gl.TEXTURE24, gl.TEXTURE25,
                            gl.TEXTURE26, gl.TEXTURE27, gl.TEXTURE28,
                            gl.TEXTURE29, gl.TEXTURE30, gl.TEXTURE31];
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
