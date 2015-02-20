//
// class triggerTable
//

function triggerTable(arg) {
    var server = new $.jqzabbix(arg.server);
    var method = 'trigger.get';
    var limit = typeof arg.maxItems !== 'undefined' ? arg.maxItems : 25;
    var params = {
        'filter': { 'value': 1 },
        'groupids': arg.groupids,
        'min_severity': typeof arg.minPriority !== 'undefined' ? arg.minPriority : 2,
        'monitored': typeof arg.monitored !== 'undefined' ? arg.monitored : 1,
        'withLastEventUnacknowledged': typeof arg.withLastEventUnacknowledged !== 'undefined' ? arg.withLastEventUnacknowledged : 1,
        'skipDependent': 1,
        'output': [ 'triggerid', 'state', 'error', 'url', 'description', 'priority', 'lastchange' ],
        'selectHosts': ['name'],
        'selectLastEvent': ['eventid'],
        'expandDescription': 1,
        'sortfield': [ 'lastchange' ],
        'sortorder': [ 'DESC' ],
        'limit': 2 * limit
    };
    var refresh = typeof arg.refresh !== 'undefined' ? arg.refresh : 10;
    var delayed = typeof arg.oldDelayed !== 'undefined' ? arg.oldDelayed : 1;
    var width = $(arg.bindTo).width();
    $( window ).unload(function() {
        server.sendAjaxRequest('user.logout', null, null, null);
    });
    doAuth();

    function startRequests() {
        server.sendAjaxRequest(method, params, successMethod, errorMethod);
        setTimeout(startRequests, refresh * 1000);
    }

    function doAuth(){
        server.userLogin(null, function() {
            $(arg.bindTo).empty();
            startRequests();
        },
        errorMethod );
    }

    function row(d) {
        function pad(s) {
            r = s.toString();
            return r.length == 1 ? '0' + r : r;
        }
        var dat = new Date(d.lastchange*1000);
        return '<table class=triggers><tr><td class=description><b>' +
            d.hosts[0].name + '</b>: ' + d.description +
            '</td><td class=datetime>' + pad (dat.getDate ()) + '.' +
            pad (dat.getMonth () + 1) + '.' + '&nbsp;' + pad (dat.getHours ()) +
            ':' + pad (dat.getMinutes ()) + ':' + pad (dat.getSeconds ()) +
            '</td></tr></table>';
    }

    function errorMethod() {
        d3.select (arg.bindTo).selectAll ("div.alert").style ('opacity', '0.5');
    }

    function successMethod(response, status) {
        width = $(arg.bindTo).width();
        var elements = response.result.length;
        var p = d3.select(arg.bindTo)
            .selectAll("div")
            .data(response.result.reverse(), function(d) { return d.triggerid; })
            .html(function(d) { return row(d) })
            .style("width", width+'px')
            .style('display', function(d,i) {
                if (i < elements-limit) return 'none';
                else return 'block';
            })
            .style ('opacity', '1.0');
        p.enter()
            .insert("div", ":first-child")
            .html(function(d) { return row(d) })
            .attr("class", function(d) {
                return 'alert c' + d.priority;
            })
            .attr("id", function(d) {
                return 'id' + d.triggerid;
            })
            .style('display', function(d,i) {
                if (i < elements-limit) return 'none';
                else return 'block';
            })
            .style("width", width+'px')
            .style("margin-left", '-' + (100 + width) + 'px')
            .on('click', function(d) {
                if (confirm('Acknowledge event: ' + d.description + '?')) {
                    server.sendAjaxRequest('event.acknowledge', {
                        "eventids": d.lastEvent.eventid,
                        "message": "Acknowledged on the WLP-FO dashboard"
                    } , function() {
                            d3.select("#id"+d.triggerid).attr('class', 'alert ack');
                    }, 0);        
                }
            })
            .transition()
            .delay(function(d) { if (delayed) return ($.now()-d.lastchange*1000)*1e-6; else return 0; })
            .duration(1200)
            .ease('bounce')
            .style("margin-left", "0px")
            .style("margin-bottom", "0px");
        p.exit()
            .transition()
            .duration(3000)
            .ease('back')
            .style("margin-left", "1000px")
            .duration(1000)
            .style("height", "0px")
            .remove();
    }
}


//
// class timeSeries
//

function timeSeries(arg) {
    var format = d3.time.format.multi([
      [".%L", function(d) { return d.getMilliseconds(); }],
      [":%S", function(d) { return d.getSeconds(); }],
      ["%H:%M", function(d) { return d.getMinutes(); }],
      ["%H:00", function(d) { return d.getHours(); }],
      ["%a %d", function(d) { return d.getDay() && d.getDate() != 1; }],
      ["%b %d", function(d) { return d.getDate() != 1; }],
      ["%B", function(d) { return d.getMonth(); }],
      ["%Y", function() { return true; }]
    ]);
    var sizex, sizey;
    var now = new Date();
	var l_margin = 50,
		r_margin = 20,
		t_margin = 10,
		b_margin = 10;
    var width, height;
	var xRange = today();
	var yRange = [0, 1000];
	var x = d3.time.scale(),
        y = d3.scale.linear();
	var xAxis = d3.svg.axis().scale(x),
		yAxis = d3.svg.axis().scale(y);

	var svg = d3.select(arg.bindTo)
        .append("svg");
	var fog = svg.append("rect")
		.attr("class", "fog");

	var xA = svg.append("g")
		.attr("class", "x axis");
	var yA = svg.append("g")
		.attr("class", "y axis")
		.attr("transform", "translate(" + l_margin + ",0)").call(yAxis);

    plotSVG();
    $(window).resize(function() {
        plotSVG();
    });

    function plotAxis() {
	    xRange = today();
	    yRange = [0, 1000];
	    xA.attr("transform", "translate(0," + (height - b_margin) + ")").call(xAxis);
	    x.range([l_margin, width + l_margin]).domain(xRange);
	    y.range([height - b_margin, t_margin]).domain([0, 1000]);

	    xAxis.orient("bottom").tickFormat(format).tickSize(-height + b_margin + t_margin).ticks(d3.time.hours, 1);
		yAxis.orient("left").tickSize(-width+1);
        xA.call(xAxis);
        yA.call(yAxis);
    }

    function plotFog() {
        fog .attr("x", x(now))
            .attr("y", t_margin)
            .attr("width", width + l_margin - x(now))
            .attr("height", height - b_margin - t_margin);
    }
    function plotData() {
    }

    function plotSVG() {
        now.getDate();
        sizex = $(arg.bindTo).width();
        sizey = $(arg.bindTo).height();
	    svg .attr("width", sizex)
            .attr("height", sizey);
		width = sizex - l_margin - r_margin,
		height = sizey - t_margin - b_margin;
        plotAxis();
        plotFog();
        plotData();
    }

	function today() {
		var now = new Date();
		var xRange = [
		    new Date(now.getFullYear(), now.getMonth(), now.getDate()),
		    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        ];
		return xRange;
	}
}
