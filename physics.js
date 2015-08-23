'use strict';

var Particle = function(point, springs, inertia, state) {
    this.point = point;
    if (!(springs instanceof Array)) {
        springs = [springs];
    }
    this.springs = springs;
    this.inertia = inertia ? inertia : 1;
    this.state_last = state ? state : new State();
    this.state = this.state_last.copy();
    this.externalForce = new CVec(0,0);
    this.contacts = [];
}

var State = function(position, momentum) {
    this.position = position ? position : new CVec(0,0);
    this.momentum = momentum ? momentum : new CVec(0,0);
};

State.prototype.set = function(other) {
    this.position.set(other.position);
    this.momentum.set(other.momentum);
    return this;
}

State.prototype.copy = function() {
    return new State(this.position.copy(), this.momentum.copy());
}

State.prototype.iadd = function(derivative) {
    this.position.iadd(derivative.dx);
    this.momentum.iadd(derivative.dp);
    return this;
}

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

var Contact = function(normal, depth, old_state, other_old_state, stiffness, damping) {
    this.normal = normal ? normal : new CVec(0,0);
    this.depth = depth ? depth : 0;
    this.old_state = old_state ? old_state : new State();
    this.other_old_state = other_old_state ? other_old_state : new State();
    this.stiffness = stiffness ? stiffness : 10;
    this.damping = damping ? damping : 0.1;
}

Contact.prototype.calculate = function(state) {
    var normal = this.normal;
    var stiffness=this.stiffness, damping=this.damping;
    var depth = this.depth;
    var dot = normal.dot(this.old_state.momentum.sub(this.other_old_state.momentum));
    //nkd - bn(n.v)
    return normal.mul(stiffness).mul(depth).sub(normal.mul(damping).mul(dot));
};

var Spring = function(point, stiffness, damping, distance, particle1, particle2, gridParameters) {
    this.point = point ? point : new CVec(0,0);
    this.stiffness = stiffness ? stiffness : 10;
    this.damping = damping ? damping : 0.25;
    this.distance = distance ? distance : 0;

    this.particle1 = particle1;
    this.particle2 = particle2;
    this.gridParameters = gridParameters;
}

Spring.prototype.calculate = function(state) {
    var point = this.point;
    var stiffness=this.stiffness, damping=this.damping;
    var distance = this.getCurrentDistance();
    //x = pt-s.x
    var transform = point.sub(state.position);
    //k * x - s.p*d
    if (distance == 0) return transform.mul(stiffness).sub(state.momentum.mul(damping));
    //|x|
    var length = transform.length();
    // t = (|x|-d)(x/|x|)
    transform.idiv(length).imul(length-distance);
    //k * t - s.p*d
    return transform.mul(stiffness).sub(state.momentum.mul(damping));
};

Spring.prototype.getCurrentDistance = function() {
    return this.distance * this.gridParameters.pulseModifier;
};

Spring.prototype.minDistance = function() {
    return Math.max(this.particle1.point.radius + this.particle2.point.radius, this.getCurrentDistance() * 0.9);
};

Spring.prototype.maxDistance = function() {
    return this.getCurrentDistance() * 1.8;
};

var acceleration = function(particle, state) {
    //TODO
    var force = new CVec();
    for (var i = 0; i < particle.springs.length; ++i) {
        force.iadd(particle.springs[i].calculate(state));
    }
    for (var i = 0; i < particle.contacts.length; ++i) {
        force.iadd(particle.contacts[i].calculate(state));
    }
    particle.contacts.length = 0;
    force.iadd(new CVec((Math.random()-.5)*400, (Math.random()-.5)*400));
    force.iadd(particle.externalForce);
    return force;
}

var evaluate = function(particle, initial, dt, derivative) {
    var state = initial.copy().iadd(derivative.mul(dt));

    var derivative = new Derivative(
        state.momentum.div(particle.inertia),
        acceleration(particle, state)
    );
    return derivative;
}

var d0 = new Derivative();
var integrate = function(particle, state, dt) {
    var d1 = evaluate(particle, state, dt*0.0, d0);
    var d2 = evaluate(particle, state, dt*0.5, d1);
    var d3 = evaluate(particle, state, dt*0.5, d2);
    var d4 = evaluate(particle, state, dt*1.0, d3);

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

    this.particles = [];
    this.springs = [];
};

GamePhysics.prototype.render = function(ctx) {
    // CanvasResizer passes a wrapped 2D context to use here when run in FIXED_COORDINATE_SYSTEM mode,
    // where ctx.canvas.width/height are set to the coordinate system width/height.
    // Otherwise the context initialized here is used.
    if (ctx === undefined) {
        ctx = this.gl;
    }
    var gl = ctx;

    return ctx;
};

GamePhysics.prototype.update = function(deltaTime) {
    //XXX: An accumulator would probably be a good idea here

    // Update previous state
    for (var i = 0; i < this.particles.length; ++i) {
        var particle = this.particles[i];
        particle.state_last.set(particle.state);
    }

    // Detect collisions
    for (var k = 0; k < this.particles.length; ++k) {
        // TODO: Optimize this with a grid-based acceleration structure to avoid O(n^2) cost.
        // Could also consider testing only edge particles.
        for (var i = k+1; i < this.particles.length; ++i) {
            var particle1 = this.particles[k];
            var particle2 = this.particles[i];
            var minDistance = particle1.point.radius + particle2.point.radius;
            var minDistanceSq = minDistance * minDistance;
            var distanceSq = particle1.state.position.distanceSq(particle2.state.position);
            if (distanceSq < minDistanceSq) {
                var normal = particle1.state.position.sub(particle2.state.position);
                var distance = normal.length();
                normal.idiv(distance);
                var depth = minDistance - distance;
                //normal, depth, old_state, other_old_state, stiffness, damping
                particle1.contacts.push(new Contact(normal, depth, particle1.state_last, particle2.state_last, 1000, 0.1));
                particle2.contacts.push(new Contact(normal.inverted(), depth, particle2.state_last, particle1.state_last, 1000, 0.1));
            }
        }
    }


    // Perform integration on all elements
    for (var i = 0; i < this.particles.length; ++i) {
        var particle = this.particles[i];
        var state = particle.state;
        integrate( particle, state, deltaTime );
    }
    
    // Hard constraints
    // for (var j = 0; j < 5; ++j) { // Relaxation
    //     // Hard constraints for springs
    //     for (var k = 0; k < this.springs.length; ++k) {
    //         var minDistance = this.springs[k].minDistance();
    //         var maxDistance = this.springs[k].maxDistance();
    //         var particle = this.springs[k].particle1;
    //         var particle2 = this.springs[k].particle2;
    //         var distance = particle.state.position.distance(particle2.state.position);
    //         if (distance < minDistance) {
    //             var diff = particle.state.position.sub(particle2.state.position);
    //             diff.normalize();
    //             diff.imul(0.5 * (minDistance - distance));
    //             particle.state.position.iadd(diff);
    //             particle.state.momentum.iadd(diff);
    //             particle2.state.position.isub(diff);
    //             particle2.state.momentum.isub(diff);
    //         }
    //         else if (distance > maxDistance) {
    //             var diff = particle.state.position.sub(particle2.state.position);
    //             diff.normalize();
    //             diff.imul(-0.5 * (distance - maxDistance));
    //             particle.state.position.iadd(diff);
    //             particle2.state.position.isub(diff);
    //         }
    //     }
    //     // // Hard constraints for all other particles in the scene
    //     // for (var k = 0; k < this.particles.length; ++k) {
    //     //     // TODO: Optimize this with a grid-based acceleration structure to avoid O(n^2) cost.
    //     //     // Could also consider testing only edge particles.
    //     //     for (var i = k+1; i < this.particles.length; ++i) {
    //     //         var particle = this.particles[k];
    //     //         var particle2 = this.particles[i];
    //     //         var minDistance = particle.point.radius + particle2.point.radius;
    //     //         var distance = particle.state.position.distance(particle2.state.position);
    //     //         if (distance < minDistance) {
    //     //             var diff = particle.state.position.sub(particle2.state.position);
    //     //             diff.normalize();
    //     //             diff.imul(0.5 * (minDistance - distance));
    //     //             particle.state.position.iadd(diff);
    //     //             particle.state.momentum.iadd(diff);
    //     //             particle2.state.position.isub(diff);
    //     //             particle2.state.momentum.isub(diff);
    //     //         }
    //     //     }
    //     // }
    // }
    
    for (var i = 0; i < this.particles.length; ++i) {
        // Update points
        var particle = this.particles[i];
        particle.point.x = particle.state.position.x;
        particle.point.y = particle.state.position.y;
    }
};

GamePhysics.prototype.renderDebug = function(ctx, grid) {
    var positions = grid.positions;
    for (var j = 0; j < positions.length; ++j) {
        var pos = positions[j];
        ctx.fillRect(pos.x - 2, pos.y - 2, 4, 4);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
};

GamePhysics.prototype.getNearestParticle = function(worldPos, smallestDistance) {
    var nearestParticle = null;
    for (var i = 0; i < this.particles.length; ++i) {
        var distance = this.particles[i].state.position.distance(worldPos);
        if (distance < smallestDistance) {
            nearestParticle = this.particles[i];
            smallestDistance = distance;
        }
    }
    return nearestParticle;
};

GamePhysics.prototype.generateMesh = function(options) {
    var defaults = {
        width: 3,
        height: 3,
        initScale: 50,
        x: 0,
        y: 0
    };
    var obj = {};
    objectUtil.initWithDefaults(obj, defaults, options);

    var grid = {
        width: obj.width,
        height: obj.height,
        positions: [],
        parameters: {
            pulseModifier: 1
        }
    };

    var gridparticles = [];

    var width = obj.width;
    var height = obj.height;
    for (var sx = 0; sx <= width; ++sx) {
        gridparticles[sx] = [];
        for (var sy = 0; sy <= height; ++sy) {
            var point = {
                x: sx * obj.initScale + obj.x,
                y: sy * obj.initScale + obj.y,
                radius: 0.45 * obj.initScale,
            };
            grid.positions.push(point);

            var springs = [];
            var state = new State(new CVec(point.x, point.y));
            var particle = new Particle(point, springs, 1, state);
            gridparticles[sx][sy] = particle;
            this.particles.push(particle);
        }
    }

    for (var sx = 0; sx <= width; ++sx) {
        for (var sy = 0; sy <= height; ++sy) {
            var particle = gridparticles[sx][sy];
            // Horizontal / vertical springs
            if (sx > 0) particle.springs.push(this.createSpring(particle, gridparticles[sx-1][sy], false, grid.parameters));
            if (sx < width) particle.springs.push(this.createSpring(particle, gridparticles[sx+1][sy], false, grid.parameters));
            if (sy > 0) particle.springs.push(this.createSpring(particle, gridparticles[sx][sy-1], false, grid.parameters));
            if (sy < height) particle.springs.push(this.createSpring(particle, gridparticles[sx][sy+1], false, grid.parameters));
            // Diagonal springs
            if (sy < height && sx < width) particle.springs.push(this.createSpring(particle, gridparticles[sx+1][sy+1], true, grid.parameters));
            if (sy > 0 && sx > 0) particle.springs.push(this.createSpring(particle, gridparticles[sx-1][sy-1], true, grid.parameters));
            if (sy < height && sx > 0) particle.springs.push(this.createSpring(particle, gridparticles[sx-1][sy+1], true, grid.parameters));
            if (sy > 0 && sx < width) particle.springs.push(this.createSpring(particle, gridparticles[sx+1][sy-1], true, grid.parameters));
        }
    }

    // This might help if the specific order that the spring hard constraints are solved in is causing trouble
    //this.springs = arrayUtil.shuffle(this.springs);
    
    return grid;
}

GamePhysics.prototype.createSpring = function(particle, target, diagonal, gridParameters) {
    var stiffness = diagonal ? 50 : 20;
    var spring = new Spring(target.state_last.position, stiffness, 0.9, particle.state.position.distance(target.state.position), particle, target, gridParameters);
    this.springs.push(spring);
    return spring;
}
