//Alexander Shieh, 2015
//Adapted from John Watson, 2014
//Licensed under the terms of the MIT License

//Define NN
var NeuralNetwork = function(){};
var layer_defs = [];

layer_defs.push({type: 'input', out_sx:1, out_sy:1, out_depth: 17});
layer_defs.push({type: 'fc', num_neurons: 6, activation: 'sigmoid'});
layer_defs.push({type: 'fc', num_neurons: 4, activation: 'sigmoid'});
layer_defs.push({type: 'fc', num_neurons: 6, activation: 'sigmoid'});
layer_defs.push({type: 'regression', num_neurons: 6});

var net = new convnetjs.Net();
net.makeLayers(layer_defs);
var trainer = new convnetjs.Trainer(net, {method: 'adadelta', l2_decay: 0.001, batch_size: 10});

var trainCnt = 0;
var trainFlag = 0;
var trainSeq = [];
var endFlag = 0;
var lastState = new convnetjs.Vol(1, 1, 24, 0.0);
var lastAction = 0;
var lastReward = 0;
var thisAction = 0;
var thisReward = 0;
var episode = 0;
var gamma = 0.8;
var testFlag = false;
var eps = 0;
var FPS = 3;
var avgTime = 0;
var result = [];

//end NN

var GameState = function(game) {
};

GameState.prototype.preload = function() {
    this.game.load.spritesheet('ship', 'assets/ship.png', 32, 32);
    this.game.load.image('terrain', 'assets/terrainblock.png');
    this.game.load.image('landzone', 'assets/landzone.png');
    this.game.load.spritesheet('explosion', 'assets/explosion.png', 128, 128);
    this.stage.disableVisibilityChange = true;
};

GameState.prototype.create = function() {
    this.stage.disableVisibilityChange = true;
    this.game.stage.backgroundColor = 0x333333;
    this.PLAYED = 0;
    this.SCORE = 0;
    this.FUEL = 600;
    this.TIMER = 0;
    this.ROTATION_SPEED = 10; // degrees/second
    this.ACCELERATION = 100; // pixels/second/second
    this.MAX_SPEED = 200; // pixels/second
    this.DRAG = 0; // pixels/second
    this.GRAVITY = 50; // pixels/second/second

    //Ship
    this.ship = this.game.add.sprite(0, 0, 'ship');
    this.ship.anchor.setTo(0.5, 0.5);
    this.ship.angle = -90; // Point the ship up
    this.game.physics.enable(this.ship, Phaser.Physics.ARCADE);
    this.ship.body.maxVelocity.setTo(this.MAX_SPEED, this.MAX_SPEED); // x, y
    this.ship.body.drag.setTo(this.DRAG, this.DRAG); // x, y
    game.physics.arcade.gravity.y = this.GRAVITY;
    this.ship.body.bounce.setTo(0.25, 0.25);
    this.resetScene();

    this.explosionGroup = this.game.add.group();

    this.game.input.keyboard.addKeyCapture([
        Phaser.Keyboard.LEFT,
        Phaser.Keyboard.RIGHT,
        Phaser.Keyboard.UP,
        Phaser.Keyboard.DOWN
    ]);
};


GameState.prototype.getExplosion = function() {

    var explosion = this.explosionGroup.getFirstDead();

    if (explosion === null) {
        explosion = this.game.add.sprite(0, 0, 'explosion');
        explosion.anchor.setTo(0.5, 0.5);

        var animation = explosion.animations.add('boom', [0,1,2,3], 60, false);
        animation.killOnComplete = true;

        this.explosionGroup.add(explosion);
    }

    explosion.revive();

    explosion.x = this.ship.x;
    explosion.y = this.ship.y;

    explosion.angle = this.game.rnd.integerInRange(0, 360);

    explosion.animations.play('boom');

    return explosion;
};

GameState.prototype.getReward = function(){
    var h, v, ax, ay;
    h = Math.max(this.ship.x, this.game.width - this.ship.x);
    v = Math.max(this.ship.y, this.game.height - this.ship.y);
    ax = this.ship.body.acceleration.x;
    ay = this.ship.body.acceleration.y;
    return Math.log(1/Math.abs(Math.pow(10, Math.max(h, v)/10-25))) - 3*(Math.sin(this.ship.rotation)+0.5) + Math.log(1/Math.abs(this.ship.body.velocity.y));
};

GameState.prototype.getState = function(){
    var state = new convnetjs.Vol(1, 1, 17, 0.0);
    state.w[0] = this.ship.body.velocity.x;
    state.w[1] = this.ship.body.velocity.y;
    state.w[2] = this.ship.body.acceleration.x;
    state.w[3] = this.ship.body.acceleration.y;
    state.w[4] = this.ship.body.angularVelocity;
    state.w[5] = Math.sin(this.ship.rotation);
    state.w[6] = Math.cos(this.ship.rotation);
    state.w[7] = this.ship.x;
    state.w[8] = this.ship.y;
    state.w[9] = this.game.width - this.ship.x;
    state.w[10] = this.game.height - this.ship.y;
    state.w[11+lastAction] = 1;
    console.log(state);
    return state;
};

GameState.prototype.updateScore = function(flag) {
    this.PLAYED++;
    if(flag) this.SCORE++;
    document.getElementById("score").innerHTML = this.SCORE+'/'+this.PLAYED;
    document.getElementById("episode").innerHTML = ++episode;
};

GameState.prototype.showVelocity = function() {
    document.getElementById("vx").innerHTML = this.ship.body.velocity.x.toFixed(2);
    document.getElementById("vy").innerHTML = this.ship.body.velocity.y.toFixed(2);
    document.getElementById("fuel").innerHTML = this.FUEL;
    document.getElementById("reward").innerHTML = lastReward.toFixed(2);
    document.getElementById("action").innerHTML = thisAction;
    document.getElementById("timer").innerHTML = this.TIMER;
    
};

GameState.prototype.resetScene = function() {
    // Move the ship back to the top of the stage
    this.ship.x = 200 + Math.random()*100;
    this.ship.y = 200 + Math.random()*100;
    this.ship.body.acceleration.setTo(0, 0);

    // Select a random starting angle and velocity
    this.ship.angle = this.game.rnd.integerInRange(-80, -100);
    this.ship.body.velocity.setTo(Math.random()*10 - 5, Math.random()*10 - 5);
    
    this.FUEL = 600;
    this.TIMER = 0;
    lastState = this.getState();
};

// The update() method is called every frame
GameState.prototype.update = function() {
    
    //Upd
    this.TIMER++;
    if(this.TIMER % FPS == 0){
        thisReward = this.getReward();
    }
    this.showVelocity(this.ship.body.velocity.x, this.ship.body.velocity.y);
    

    //Game Over
    if(this.ship.x > this.game.width || this.ship.x < 0 || this.ship.y > this.game.height || this.ship.y < 0){
        endFlag = 1;
        this.updateScore(endFlag);
    }else if(this.FUEL <= 0){
        endFlag = 2;
        this.updateScore(endFlag);
    }


    //Rotation
    if(thisAction == 2 || thisAction == 4) {
        this.ship.body.angularVelocity = -this.ROTATION_SPEED;
    }else if(thisAction == 3 || thisAction == 5) {
        this.ship.body.angularVelocity = this.ROTATION_SPEED;
    }else{
        this.ship.body.angularVelocity = 0;
    }

    if(thisAction == 1 || thisAction == 4 || thisAction == 5) {
        this.ship.body.acceleration.x = Math.cos(this.ship.rotation) * this.ACCELERATION;
        this.ship.body.acceleration.y = Math.sin(this.ship.rotation) * this.ACCELERATION;
        this.FUEL -= 1;
        this.ship.frame = 1;
    }else{
        this.ship.body.acceleration.setTo(0, 0);
        this.ship.frame = 0;
    }
    
    if(endFlag == 1) lastReward -= 10;

    if(this.TIMER % FPS == 0){
        thisState = this.getState();
        thisAction = -1;
        var max = -1e9;
        approx = net.forward(thisState);
        console.log(approx.w);
        if(!testFlag && Math.random() > eps){
            thisAction = Math.floor(Math.random()*6);
            max = approx.w[thisAction];
        }else{
            //argmax
            for(var a = 0; a < 6; ++a){
                if(approx.w[a] > max){
                    thisAction = a;
                    max = approx.w[a];
                }
            }
        }

        if(!testFlag) trainSeq.push([lastState, lastAction, thisReward-lastReward, thisState]);
        lastState = thisState;
        lastAction = thisAction;
        lastReward = thisReward;
    }
    
    if(endFlag && !testFlag){

        for(var i = 0; i < trainSeq.length; ++i){
            var j = Math.floor(Math.random()*trainSeq.length);
            var temp = trainSeq[i];
            trainSeq[i] = trainSeq[j];
            trainSeq[j] = temp;
        }
        while(trainSeq.length){
            var data = trainSeq.pop();
            var X = data[0];
            var Y = net.forward(data[0]);
            var Z = net.forward(data[3]);
            var max = -1e9
            for(var a = 0; a < 6; ++a){
                if(Z.w[a] > max){
                    max = Z.w[a];
                }
            }
            Y.w[data[1]] = data[2] + gamma*max;
            trainer.train(X, Y.w);
        }
    }
    if(endFlag){
        
        avgTime += this.TIMER;
        if(this.PLAYED % 20 == 0){
            result.push(avgTime/20);
            avgTime = 0;
            console.log(result);
        }

        lastReward = 0;
        thisReward = 0;
        endFlag = 0;
        this.resetScene(); 
    }

};

GameState.prototype.leftInputIsActive = function() {
    var isActive = false;

    isActive = this.input.keyboard.isDown(Phaser.Keyboard.LEFT);
    // isActive |= (this.game.input.activePointer.isDown &&
    //     this.game.input.activePointer.x < this.game.width/4);

    return isActive;
};

GameState.prototype.rightInputIsActive = function() {
    var isActive = false;

    isActive = this.input.keyboard.isDown(Phaser.Keyboard.RIGHT);
    // isActive |= (this.game.input.activePointer.isDown &&
    //     this.game.input.activePointer.x > this.game.width/2 + this.game.width/4);

    return isActive;
};

GameState.prototype.upInputIsActive = function() {
    var isActive = false;

    isActive = this.input.keyboard.isDown(Phaser.Keyboard.UP);
    // isActive |= (this.game.input.activePointer.isDown &&
    //     this.game.input.activePointer.x > this.game.width/4 &&
    //     this.game.input.activePointer.x < this.game.width/2 + this.game.width/4);

    return isActive;
};

var game = new Phaser.Game(500, 500, Phaser.AUTO, 'game');
game.state.add('game', GameState, true);