'use strict';

var Spring = function(point, stiffness, damping) {
    this.point = point ? point : new CVec(0,0);
    this.stiffness = stiffness ? stiffness : 10;
    this.damping = damping ? damping : 0.25;
}

var State = function(inertia, position, momentum, point, springs) {
    this.inertia = inertia ? inertia : 1;
    this.position = position ? position : new CVec(0,0);
    this.momentum = momentum ? momentum : new CVec(0,0);
    this.point = point;
    if (!(springs instanceof Array)) {
        springs = [springs];
    }
    this.springs = springs;
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
        this.momentum.add(derivative.dp),
        this.point,
        this.springs
    )
}

var acceleration = function(state) {
    //TODO
    var force = new CVec();
    for (var i = 0; i < state.springs.length; ++i) {
        var point = state.springs[i].point;
        var stiffness=state.springs[i].stiffness, damping=state.springs[i].damping;
        force.iadd(point.sub(state.position).mul(stiffness).sub(state.momentum.mul(damping)));
    }
    return force;
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

/**
 * An updater to handle the physics loop and state changes
 */
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
                x: -0.5,
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

    this.states = [];

    for (var i = 0; i < 4; ++i) {
        var point = this.testGrid.positions[i];
        var springs = [new Spring(new CVec(point.x*100, point.y*100), 10-1*i, 0.6+0.05*i)];
        var state = new State(i, new CVec(), new CVec(), point, springs);
        this.states.push(state);
    }
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

    for (var i = 0; i < this.states.length; ++i) {
        var state = this.states[i];
        integrate( state, deltaTime );
        state.point.x = state.position.x/100;
        state.point.y = state.position.y/100;
    }
};
