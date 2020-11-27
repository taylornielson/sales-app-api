const express = require('express');
const app = express();
const pg = require('pg');
var bodyParser = require('body-parser')
var jsonParser = bodyParser.json();
var connectionString = "postgres://lovokfeeoskshg:6fd7f6f0ed989815022d738e57c07503cb08d76efa59429703a1e80feb380dce@ec2-54-224-175-142.compute-1.amazonaws.com:5432/de00rcg78rpakt";


app.get('/', function(req, res) {
	res.send('Hello World!');
});

app.get('/createDatabase', function(request, response) {
	var pgClient = new pg.Client(connectionString);
	pgClient.connect();
	pgClient.query("CREATE TABLE IF NOT EXISTS ADDRESS (addressId SERIAL PRIMARY KEY, street varchar(255), city varchar(255), state varchar(3), zip varchar(20), areaid int, lat float, long float, value int)",(err,res)=>{
		console.log(err,res);
	});
	pgClient.query("CREATE TABLE if NOT exists AREA (areaId SERIAL PRIMARY KEY, MedianHomeValue int, LatTopLeft FLOAT, LongTopLeft FLOAT, LatBottomRight FLOAT, LongBottomRight FLOAT, userId varchar(255))", (err,res)=>{
		console.log(err,res);
	});
	pgClient.query("CREATE TABLE if NOT exists LOGIN (loginId SERIAL PRIMARY KEY, username varchar(255),password varchar(255))",(err,res)=>{
        	console.log(err,res);
        });
	pgClient.query("CREATE TABLE if NOT exists USERS (userId SERIAL PRIMARY KEY, loginId int, companyId varchar(255), firstName varchar(255), lastName varchar(255), status varchar(255))", (err,res)=>{
		console.log(err, res);
	});
	pgClient.query("CREATE TABLE if NOT exists COMPANY (companyId SERIAL PRIMARY KEY, name varchar(255))", (err,res)=>{
		console.log(err, res);
	});
	pgClient.query("CREATE TABLE if NOT exists KNOCK (knockId SERIAL PRIMARY KEY, userId int, addressId int, status varchar(255), note varchar(255))", (err,res)=>{
		console.log(err,res);
		response.send(res);
		pgClient.end();
	});
});

app.post('/addAddress', jsonParser, function(request, response){
	var pgClient = new pg.Client(connectionString);
	pgClient.connect();
	pgClient.query("INSERT into Address (street, city, state, zip, lat, long,value) VALUES($1,$2,$3,$4,$5,$6,$7)",[request.body.street, request.body.city, request.body.state, request.body.zip, request.body.lat, request.body.long, request.body.value],(err,res)=>{
		console.log(err,res);
		response.send({"message":err});
		pgClient.end();
	});
});

async function getAverageValue(lat1, long1, lat2, long2){
	var pgClient = new pg.Client(connectionString);
	pgClient.connect();
	var { rows } = await pgClient.query("select AVG(value) from address where lat < $1 and  Lat > $2 and long > $3 and long < $4 and value > 0",[lat1, lat2, long1, long2]);
	pgClient.end();
	return rows[0];
}


async function getAreaRating(){
	var pgClient = new pg.Client(connectionString);
	pgClient.connect();
	var { rows } = await pgClient.query("select count(addressid) as num from Address where value>0");
	var third = rows[0]["num"];
	pgClient.end();
	return Math.floor(third/3);
}


async function getSalesmen(){
	var salesmen = []
	var pgClient = new pg.Client(connectionString);
        pgClient.connect();
        var { rows } = await pgClient.query("select userid from USERS where status='salesman'");
	for (row in rows){
		salesmen.push(rows[row]["userid"]);
	}
	pgClient.end();
        return salesmen;
}



app.post('/getSuggestedSalesmen', jsonParser,async function(request, response){
	var third = await getAreaRating();
	var pgClient = new pg.Client(connectionString);
        pgClient.connect();
	var { rows } = await pgClient.query("select value from address where value>0 ORDER BY value limit 1 offset $1",[third]);
	var bottomTop = rows[0]["value"];
	var { rows } = await pgClient.query("select value from address where value>0 ORDER BY value limit 1 offset $1",[third*2]);
	var middleTop = rows[0]["value"];
	var salesmen = await getSalesmen();
	console.log("salesmen = " + salesmen);
	var bestConv = [];
	var i;
	for (i = 0; i < salesmen.length; i++){
		console.log(salesmen[i], bottomTop, middleTop);
		var lowConv;
		try {
			var {rows} = await pgClient.query("select (select cast(count(knockid) as decimal) from knock join address on address.addressid = knock.addressid where status='sold' and value>0 and userid=$1 and value <= $2) / (select count(knockid) from knock join address on address.addressid = knock.addressid where value > 0 and value <= $2 and userid=$1) as converge",[salesmen[i], bottomTop]);
			lowConv = rows[0]["converge"];
			console.log("low conv = " +lowConv);
		}catch{
			console.log("entered low catch");
			lowConv = 0;
			console.log("low conv = " +lowConv);
		}
		var midConv;
		try{
			var {rows} = await pgClient.query("select (select cast(count(knockid) as decimal) from knock join address on address.addressid = knock.addressid where status='sold' and value>$1 and userid=$2 and value < $3) / (select count(knockid) from knock join address on address.addressid = knock.addressid where value>$1 and userid=$2 and value<$3) as converge",[bottomTop,salesmen[i],middleTop]);
			midConv = rows[0]["converge"];
			console.log("mid conv = " + midConv);
		}catch{
			console.log("entered mid catch");
			midConv = 0;
			console.log("mid conv = " + midConv);
		}
		var highConv;
		try{
                	var {rows} = await pgClient.query("select (select cast(count(knockid) as decimal) from knock join address on address.addressid = knock.addressid where status='sold' and value>=$1 and userid=$2) / (select count(knockid) from knock join address on address.addressid = knock.addressid where value>=$1 and userid=$2) as converge",[middleTop, salesmen[i]]);
			highConv = rows[0]["converge"];
			console.log("high conv = " +highConv);
		}catch{
			console.log("entered high catch");
			highConv = 0;
			console.log("high conv = " + highConv);
		}
		if (lowConv >= midConv){
			if(lowConv >= highConv){
				bestConv.push("low");
			}
			else{
				bestConv.push("high");
			}
		}else if (midConv >= highConv){
			bestConv.push("mid");
		}
		else{
			bestConv.push("high");
		}
	}
	if (request.body.value < bottomTop){
		var answer = [];
		var i;
		for (i = 0; i < bestConv.length; ++i){
			if (bestConv[i] == "low"){
				answer.push(salesmen[i]);
			}
		}
		var { rows } = await pgClient.query("Select firstname, lastname, userid from users where userid = ANY($1)",[answer]);
		//if (rows.length == 0){
		//	response.send("Any");
		//}else{
		response.send(rows);
		pgClient.end();//}
	}else if (request.body.value < middleTop){
		var answer = [];
                var i;
                for (i = 0; i < bestConv.length; ++i){
                        if (bestConv[i] == "mid"){
                                answer.push(salesmen[i]);
                        }
                }
                var { rows } = await pgClient.query("Select firstname, lastname, userid from users where userid = ANY($1)",[answer]);
                response.send(rows);
		pgClient.end();
	}
	else{
	   	var answer = [];
                var i;
                for (i = 0; i < bestConv.length; ++i){
                        if (bestConv[i] == "high"){
                                answer.push(salesmen[i]);
                        }
                }
                var { rows } = await pgClient.query("Select firstname, lastname, userid from users where userid = ANY($1)",[answer]);
                response.send(rows);
		pgClient.end();
	}
});

app.post('/deleteAreas', function(request, response) {
	var pgClient = new pg.Client(connectionString);
	pgClient.connect();
	pgClient.query("DELETE FROM AREA", (err,res)=>{
		console.log(res);
		response.send({"message":"Deleted all"});
		pgClient.end();
	});
});

app.post('/addUser', jsonParser, function(request, response){
	var pgClient = new pg.Client(connectionString);
	pgClient.connect();
	pgClient.query("INSERT into USERS (firstname, lastname, status) VALUES($1,$2,$3)",[request.body.firstname, request.body.lastname, request.body.status],(req,res)=>{
		console.log(res);
		response.send({"message":"added user"});
		pgClient.end();
	});
});

app.post('/deleteUserTable',function(request,response){
	var pgClient = new pg.Client(connectionString);
        pgClient.connect();
	pgClient.query("DROP TABLE USERS", (req,res)=>{
		console.log(res);
		response.send({"message":"Deleted table"});
		pgClient.end();
	});
});


app.post('/addKnock', jsonParser, function(request, response){
	var pgClient = new pg.Client(connectionString);
	pgClient.connect();
	pgClient.query("INSERT into KNOCK (status, userid, addressid, note) VALUES($1,$2,$3,$4)",[request.body.status, request.body.userid, request.body.addressid, request.body.note],(req, res)=>{
		console.log(res);
		response.send({"message":"added knock"});
		pgClient.end();
	});
});


app.post('/deleteKnockTable',function(request,response){
        var pgClient = new pg.Client(connectionString);
        pgClient.connect();
        pgClient.query("DROP TABLE Knock", (req,res)=>{
                console.log(res);
                response.send({"message":"Deleted table"});
                pgClient.end();
        });
});


//app.post('/updateKnock')
app.post('/addArea', jsonParser, async function(request, response){
	console.log(request);
	var avgVal = await getAverageValue(request.body.topleftlat,request.body.topleftlong, request.body.bottomrightlat,request.body.bottomrightlong);
	var pgClient = new pg.Client(connectionString);
	pgClient.connect();
	let res = await pgClient.query("INSERT into Area (lattopleft, longtopleft, latbottomright, longbottomright, medianhomevalue) VALUES($1,$2,$3,$4,$5)",[request.body.topleftlat,request.body.topleftlong, request.body.bottomrightlat,request.body.bottomrightlong, Math.trunc(avgVal["avg"])]);
	var {rows} = await pgClient.query("Select areaid from area order by areaid desc limit 1");
	pgClient.end();
	response.send({"avg":Math.trunc(avgVal["avg"]),"areaid":rows[0]["areaid"]});
});


//app.get('/getKnock')
//app.get('/getAreaValue')
//app.get('/getAddress')
app.listen( process.env.PORT || 3000,() => console.log('Labrynth app listening on port 3000!'));
