'use strict';

/**
 * An object representing a shader program, tied to the specific gl context.
 * @constructor
 * @param {WebGLRenderingContext} gl The WebGL context.
 * @param {string} fragmentShaderSource GLSL source code for the fragment
 * shader.
 * @param {string} vertexShaderSource GLSL source code for the vertex shader.
 * @param {Object.<string, string>} uniforms Map from uniform names to uniform
 * types. Uniform type is specified as postfix to gl.uniform function name or
 * 'tex2d' in case of a texture.
 * @param {Object.<string, number>} attributes Map from attribute names to
 * attribute locations. Defaults to ShaderProgram.defaultAttributes.
 */
var ShaderProgram = function(gl, fragmentShaderSource, vertexShaderSource,
                             uniforms, attributes) {
    if (attributes === undefined) {
        attributes = ShaderProgram.defaultAttributes;
    }
    this.gl = gl;
    this.uniforms = {};

    var vertexShader = ShaderProgram.compileShaderSource(this.gl,
                                                   this.gl.VERTEX_SHADER,
                                                   vertexShaderSource);
    var fragmentShader = ShaderProgram.compileShaderSource(this.gl,
                                                     this.gl.FRAGMENT_SHADER,
                                                     fragmentShaderSource);

    this.shaderProgram = this.gl.createProgram();
    this.gl.attachShader(this.shaderProgram, vertexShader);
    this.gl.attachShader(this.shaderProgram, fragmentShader);
    for (var key in attributes) {
        if (attributes.hasOwnProperty(key)) {
            this.gl.bindAttribLocation(this.shaderProgram, attributes[key], key);
        }
    }
    this.gl.linkProgram(this.shaderProgram);

    if (!this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS)) {
        console.log('Unable to initialize shader program from shaders:\nINFO:' +
                    '\n' + this.gl.getProgramInfoLog(this.shaderProgram) +
                    '\nVERTEX:\n' + vertexShaderSource +
                    '\nFRAGMENT:\n' + fragmentShaderSource);
    }
    for (var key in uniforms) {
        if (uniforms.hasOwnProperty(key)) {
            var gltype = uniforms[key];
            var location = this.gl.getUniformLocation(this.shaderProgram, key);
            if (location === null) {
                console.log('Could not locate uniform ' + key +
                            ' in compiled shader');
                console.log(fragmentShaderSource + '\n\n' + vertexShaderSource);
            }
            this.uniforms[key] = new ShaderProgram.Uniform(gltype, location);
        }
    }

    for (var key in attributes) {
        if (attributes.hasOwnProperty(key)) {
            var location = this.gl.getAttribLocation(this.shaderProgram, key);
            if (location !== attributes[key]) {
                if (location === -1) {
                    console.log('Vertex attribute ' + key + ' location -1, possible that attribute is not statically used');
                } else {
                    console.log('Vertex attribute ' + key + ' location unexpected, ' + vertexPositionAttribLoc);
                }
            }
        }
    }    
};

ShaderProgram.defaultAttributes = {'aVertexPosition': 0};

/**
 * Uniform type and location information.
 * @constructor
 * @param {string} gltype Postfix to gl.uniform function name or 'tex2d' in case
 * of a texture.
 * @param {WebGLUniformLocation} location Location of the uniform.
 * @protected
 */
ShaderProgram.Uniform = function(gltype, location) {
    this.gltype = gltype;
    this.location = location;
};

/**
 * @return {Object.<string,*>} Map from uniform names to uniform values that
 * should be filled in and passed to the shader program to draw.
 */
ShaderProgram.prototype.uniformParameters = function() {
    var uniformParams = {};
    for (var key in this.uniforms) {
        if (this.uniforms.hasOwnProperty(key)) {
            uniformParams[key] = null;
        }
    }
    return uniformParams;
};

/**
 * Set the ShaderProgram as active and set uniform values to use with it.
 * @param {Object.<string,*>} uniforms Map from uniform names to uniform values.
 * Single uniforms must not be passed in an array, vector uniforms must be
 * passed in an array. Texture uniforms must be passed as WebGLTexture.
 */
ShaderProgram.prototype.use = function(uniforms) {
    this.gl.useProgram(this.shaderProgram);
    var texU = 0;
    for (var key in uniforms) {
        if (this.uniforms.hasOwnProperty(key)) {
            var gltype = this.uniforms[key].gltype;
            var location = this.uniforms[key].location;
            if (gltype === 'tex2d') {
                if (texU < ShaderProgram.maxTextureUnits) {
                    this.gl.activeTexture(ShaderProgram.textureUnits[texU]);
                } else {
                    console.log('Too many textures in ShaderProgram.use');
                    return;
                }
                this.gl.bindTexture(this.gl.TEXTURE_2D, uniforms[key]);
                this.gl.uniform1i(location, texU);
                ++texU;
            } else if (gltype === '1i') {
                this.gl.uniform1i(location, uniforms[key]);
            } else if (gltype === '2iv') {
                this.gl.uniform2iv(location, uniforms[key]);
            } else if (gltype === '3iv') {
                this.gl.uniform3iv(location, uniforms[key]);
            } else if (gltype === '4iv') {
                this.gl.uniform4iv(location, uniforms[key]);
            } else if (gltype === '1f') {
                this.gl.uniform1f(location, uniforms[key]);
            } else if (gltype === '2fv') {
                this.gl.uniform2fv(location, uniforms[key]);
            } else if (gltype === '3fv') {
                this.gl.uniform3fv(location, uniforms[key]);
            } else if (gltype === '4fv') {
                this.gl.uniform4fv(location, uniforms[key]);
            } else if (gltype === 'Matrix2fv') {
                this.gl.uniformMatrix2fv(location, false, uniforms[key]);
            } else if (gltype === 'Matrix3fv') {
                this.gl.uniformMatrix3fv(location, false, uniforms[key]);
            } else if (gltype === 'Matrix4fv') {
                this.gl.uniformMatrix4fv(location, false, uniforms[key]);
            } else {
                console.log('Unrecognized uniform type in ShaderProgram.use: ' +
                            gltype);
            }
        } else if (uniforms.hasOwnProperty(key)) {
            console.log('Invalid uniform name in ShaderProgram.use: ' + key +
                        ' ' + uniforms[key]);
        }
    }
    return;
};


/**
 * Compile a shader from source.
 * @param {WebGLRenderingContext} gl The WebGL context.
 * @param {GLenum} type Type of the shader. Must be gl.FRAGMENT_SHADER or
 * gl.VERTEX_SHADER.
 * @param {string} shaderSource The shader source.
 * @return {WebGLShader} The created shader.
 */
ShaderProgram.compileShaderSource = function(gl, type, shaderSource) {
    var shader = gl.createShader(type);

    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.log('An error occurred compiling a shader:' +
                    gl.getShaderInfoLog(shader));
        console.log(shaderSource);
        return null;
    }

    return shader;
};

/**
 * A shader program cache for a specific WebGL context.
 * @param {WebGLRenderingContext} gl The WebGL context.
 * @return {function(string, string, Object.<string, string>)} ShaderProgram
 * constructor wrapped in a caching closure.
 */
ShaderProgram.createCache = function(gl) {
    var shaders = [];

    return function(fragmentSource, vertexSource, uniforms) {
        // No need to use object for storing this few variables
        for (var i = 0; i < shaders.length; ++i) {
            if (shaders[i].fragmentSource === fragmentSource &&
                shaders[i].vertexSource === vertexSource) {
                return shaders[i];
            }
        }
        var shader = new ShaderProgram(gl, fragmentSource, vertexSource,
                                       uniforms);
        shader.fragmentSource = fragmentSource;
        shader.vertexSource = vertexSource;
        shaders.push(shader);
        return shader;
    };
};

/**
 * Sources for simple utility vertex shaders.
 */
ShaderProgram.vertexLibrary = {
    textured: [
        'attribute vec2 aVertexPosition;',
        'attribute vec2 aTexCoord;',
        'uniform mat4 uWorldTransform;',
        'varying vec2 vTexCoord;',
        'void main() {',
        '    gl_Position = uWorldTransform * vec4(aVertexPosition, 0.0, 1.0);',
        '    vTexCoord = aTexCoord;',
        '}'
    ].join('\n')
};

/**
 * Sources for simple utility fragment shaders.
 */
ShaderProgram.fragmentLibrary = {
    textured: [
        'precision highp float;',
        'uniform sampler2D uTex;',
        'varying vec2 vTexCoord;',
        'void main() {',
        '    vec4 texColor = texture2D(uTex, vTexCoord);',
        '    gl_FragColor = texColor;',
        '}'
    ].join('\n'),

    texturedHilighted: [
        'precision highp float;',
        'uniform sampler2D uTex;',
        'uniform float uHilight;',
        'uniform vec2 uHilightTexCoord;',
        'varying vec2 vTexCoord;',
        'void main() {',
        '    vec4 texColor = texture2D(uTex, vTexCoord);',
        '    float hilightMul = clamp(1.0 - distance(vTexCoord, uHilightTexCoord) * 2.0, 0.0, 1.0);',
        '    vec4 hilightCol = vec4(vec3(uHilight * hilightMul), 0);',
        '    gl_FragColor = texColor + hilightCol;',
        '}'
    ].join('\n')
};

ShaderProgram.textureUnits = []; // GL_TEXTURE* enums for easy access.
ShaderProgram.maxTextureUnits = 32; // Will be filled in by feature detection in utilgl.js

(function() {
    var firstUnit = 0x84C0;
    for (var i = 0; i < 32; ++i) {
        ShaderProgram.textureUnits.push(firstUnit + i);
    }
})();
