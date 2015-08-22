'use strict';

/**
 * An updater to handle the physics loop and state changes
 */

var State = function(inertia, position, momentum) {
	this.inertia = inertia ? inertia : 1;
    this.position = position ? position : new CVec(0,0);
    this.momentum = momentum ? momentum : new CVec(0,0);
};

/**
 * Holds the intermediate state for the integration
 */
var Derivative = function(dx, dp) {
    this.dx = dx ? dx : new CVec(0,0); //velocity
    this.dp = dp ? dp : new CVec(0,0); //force
}

Derivative.prototype.iadd = function(other) {
    this.dx.iadd(other.dx);
    this.dp.iadd(other.dp);
    return this;
}

Derivative.prototype.add = function(other) {
    return new Derivative(
        this.dx.add(other.dx),
        this.dp.add(other.dp)
    )
}

Derivative.prototype.mul = function(scalar) {
    return new Derivative(
        this.dx.mul(scalar),
        this.dp.mul(scalar)
    )
}

Derivative.prototype.imul = function(scalar) {
    this.dx.imul(scalar);
    this.dp.imul(scalar);
    return this;
}

State.prototype.add = function(derivative) {
    return new State(
    	this.inertia,
        this.position.add(derivative.dx),
        this.momentum.add(derivative.dp)
    )
}

var acceleration = function(state) {
    //TODO
    var point = new CVec(-50,50);
    var stiffness=40, damping=0.5;
    return point.sub(state.position).mul(stiffness).sub(state.momentum.mul(damping));
}

var evaluate = function(initial, dt, derivative) {
    var state = initial.add(derivative.mul(dt));

    var derivative = new Derivative(
        state.momentum.div(state.inertia),
        acceleration(state)
    );
    return derivative;
}

var d0 = new Derivative();
var integrate = function(state, dt) {
    var d1 = evaluate(state, dt*0.0, d0);
    var d2 = evaluate(state, dt*0.5, d1);
    var d3 = evaluate(state, dt*0.5, d2);
    var d4 = evaluate(state, dt*1.0, d3);

    d2.iadd(d3).imul(2);
    d4.iadd(d1).iadd(d2).imul(1/6);

    state.position.iadd(d4.dx.mul(dt));
    state.momentum.iadd(d4.dp.mul(dt));
}

var GamePhysics = function(resizer) {
    this.canvas = resizer.getCanvas();
    this.gl = this.canvas.getContext('webgl');
    Sprite.gl = this.gl;
    this.time = 0;
    this.testSoftBodyRenderer = new SoftBodyRenderer(this.gl, 'test.png');

    this.testGrid = {
        width: 1,
        height: 1,
        positions: [
            {
                x: -0.5,
                y: 0.5,
                radius: 0.1
            },
            {
                x: -0.5 + Math.sin(this.time) * 0.1,
                y: -0.5,
                radius: 0.1
            },
            {
                x: 0.5,
                y: 0.5,
                radius: 0.1
            },
            {
                x: 0.5,
                y: -0.5,
                radius: 0.1
            }
        ]
    };

    this.state = new State(1);
};

GamePhysics.prototype.render = function(ctx) {
    // CanvasResizer passes a wrapped 2D context to use here when run in FIXED_COORDINATE_SYSTEM mode,
    // where ctx.canvas.width/height are set to the coordinate system width/height.
    // Otherwise the context initialized here is used.
    if (ctx === undefined) {
        ctx = this.gl;
    }
    var gl = ctx;

    this.testSoftBodyRenderer.render(this.testGrid);

    return ctx;
};

GamePhysics.prototype.update = function(deltaTime) {
    //XXX: An accumulator would probably be a good idea here
    this.testGrid.positions[0].x = this.state.position.x/100;
    this.testGrid.positions[0].y = this.state.position.y/100;
    integrate( this.state, deltaTime );
};
