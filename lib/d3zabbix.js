//
// server class (requests to server)
//
var start_ = [];                                // array for all startRequest() methods
var req;                                        // global request method

function serverHandle(arg) {
    var jqzabbix = new $.jqzabbix(arg);
    jqzabbix.userLogin(null, startWidgets, onError);
    $( window ).unload(function() {             // logout on close window
        jqzabbix.sendAjaxRequest('user.logout', null, null, null);
    });
    function startWidgets() {
        start_.forEach(function(callback) { // call startRequest() for every widget
            callback();
        });
    }
    function request(method, params, ok, nok) {
        jqzabbix.sendAjaxRequest(method, params, ok, function() {
            onError();                          // call onError here
            nok.call();                         // before given one
        });
    }
    function onError() {
        $.each(jqzabbix.isError(), function(key, value) {
            console.log(key + ' : ' + value);   // log errors to console
        });
    }
    req = request;
}

//
// class triggerTable
//

function triggerTable(arg) {
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
    start_.push(startRequests);
    var width = $(arg.bindTo).width();

    function startRequests() {
        console.log('starting requests for triggerTable');
        req(method, params, successMethod, errorMethod);
        setTimeout(startRequests, 10000);
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
        console.log('request failed');
        d3.select (arg.bindTo).selectAll ("div.alert").style ('opacity', '0.5');
    }

    function successMethod(response, status) {
        console.log('triggerTable success');
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
                    req('event.acknowledge', {
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
    var refresh = typeof arg.refresh !== 'undefined' ? arg.refresh : 10;
    start_.push(startRequests);
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
    var tick_sizing = [
        [    1200, d3.time.minutes,  1 ],
        [    3600, d3.time.minutes,  5 ],
        [   14400, d3.time.minutes, 15 ],
        [   43200, d3.time.minutes, 30 ],
        [   86400, d3.time.hours,    1 ],
        [  172800, d3.time.hours,    2 ],
        [  432000, d3.time.hours,    4 ],
        [  604800, d3.time.hours,   12 ],
        [ 2592000, d3.time.days,     1 ],
        [ 5184000, d3.time.days,     2 ],
        [10368000, d3.time.days,      7],
    ];
    var sizex, sizey;
    var now = new Date();
    var l_margin = 50,
        r_margin = 20,
        t_margin = 10,
        b_margin = 10;
    var width, height;

    var animate = 2000;
    var itemids = typeof arg.itemids !== 'undefined' ? arg.itemids : null;
    var itemValueType = -1;

    var xRange = last(24);
    var yRange = [0, 500];
    var vRange = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    var Range;
    var x = d3.time.scale(),
        y = d3.scale.linear();
    var xAxis = d3.svg.axis().scale(x),
        yAxis = d3.svg.axis().scale(y);

    var svg = d3.select(arg.bindTo)
        .append("svg");
    var fog = svg.append("rect")
        .attr("class", "fog");

    var xA = svg.append("g")
        .attr("class", "x axis")
        .call(xAxis);
    var yA = svg.append("g")
        .attr("class", "y axis")
        .attr("transform", "translate(" + l_margin + ",0)")
        .call(yAxis);
    
    var valueline = d3.svg.line()
        .x(function(d) { return x(d[0]*1000); })
        .y(function(d) { return y(d[1]); })
        .interpolate("step-after");
    var values = [];
    var path = svg.append("path")
            .style('stroke', 'steelblue')
            .style('stroke-width', 1)
            .style('fill', 'none');
    var zoom = d3.behavior.zoom()
            .scaleExtent([.01, 100])
            .on("zoom", zoomed)
            .on("zoomend", function() {
                console.log('zoomend');
                startRequests();
            });
    var drag = d3.behavior.drag()
            .on("dragstart", function() {
                d3.event.sourceEvent.stopPropagation();
            })
            .on("drag", dragged);
    svg.call(zoom).call(drag);

    plotSVG(0);
    $(window).resize(function() {
        plotSVG(0);
    });

    function getItemValueTypes() {
        req('item.get', {
            'output': [ 'value_type' ],
            'itemids': itemids
        }, function(r) {
            itemValueType = r.result[0].value_type;
            startRequests();
        }, 0);
    }

   function startRequests() {
        if (itemValueType == -1) {
            getItemValueTypes();
            return;
        }
        var x0 = Math.round(xRange[0]/1000),
            x1 = Math.round(xRange[1]/1000);
        if (x0 + 60 >= vRange[0]) { x0 = vRange[1]; }
        if (x1 - 60 <= vRange[1]) { x1 = vRange[0]; }
        if (x0 >= x1) {
            console.log('no data needed');
            return;
        } else {
            console.log('request for timeSeries');
        }
        req('history.get', {
            "output": 'extend',
            "history": 3,
            "itemids": itemids,
            "value_type": itemValueType,
            "sortfield": "clock",
            "sortorder": "ASC",
            "time_from": x0,
            "time_till": x1,
        }, onData, 0);
    }

    function onData(response, status) {
        function uniq(a) {
            var seen = {};
            return a.filter(function(item) {
                return seen.hasOwnProperty(item[0]) ? false : (seen[item[0]] = true);
            });
        }
        var a = response.result.map(function(o) {
            if (o.clock < vRange[0]) vRange[0] = Number(o.clock);
            if (o.clock > vRange[1]) vRange[1] = Number(o.clock);
            return [ o.clock, o.value ];
        });
        values = uniq(values.concat(a)).sort(function(a,b) {
            return a[0] < b[0];
        });
        plotSVG();
    }

    function plotAxis(t = 0) {
        x.range([l_margin, width + l_margin]).domain(xRange);
        var x0 = Math.round(xRange[0]/1000)
        var x1 = Math.round(xRange[1]/1000)
        var min = Number.POSITIVE_INFINITY;
        var max = Number.NEGATIVE_INFINITY;
        var a, b;
        for (var i=values.length-1; i>=0; i--) {
            a = values[i][0];
            b = Number(values[i][1]);
            if (x0 < a && a < x1) {
                if (b < min) min = b;
                if (b > max) max = b;
            }
        }
        yRange = [0,max];
        y.range([height - b_margin, t_margin]).domain(yRange).nice();

        Range = (xRange[1]-xRange[0]) / 1000;
        var sizing = tick_sizing.find(function(element, index, array) {
            if (element[0] < Range) return false;
            else return true;
        });
        xAxis
            .orient("bottom")
            .tickFormat(format)
            .tickSize(-height + b_margin + t_margin)
            .ticks(sizing[1], sizing[2]);
        yAxis
            .orient("left")
            .tickSize(-width+1);
        xA  .attr("transform", "translate(0," + (height - b_margin) + ")")
            .call(xAxis)
        yA.call(yAxis);
    }

    function plotFog(t = 0) {
        now = new Date();
        fog .attr("x", x(now))
            .attr("y", t_margin)
            .attr("width", width + l_margin - x(now))
            .attr("height", height - b_margin - t_margin);
    }

    function plotData(t = 0) {
        var x0 = Math.round(xRange[0]/1000)
        var x1 = Math.round(xRange[1]/1000)
        path.attr("d", valueline(values.filter(function(o) {
            if (o[0] >= x0 && o[0] <= x1) return true;
            else return false;
        })));
    }

    function plotSVG(t = 0) {
        sizex = $(arg.bindTo).width();
        sizey = $(arg.bindTo).height();
        svg .attr("width", sizex)
            .attr("height", sizey);
        width = sizex - l_margin - r_margin,
        height = sizey - t_margin - b_margin;
        plotAxis(t);
        plotFog(t);
        if (values !== undefined) plotData(t);
    }

    function dragged(d) {
        var move = +x.invert(d3.event.x) - x.invert(d3.event.x - d3.event.dx);
        xRange = [
            new Date(+xRange[0] - move),
            new Date(+xRange[1] - move)
        ];
        plotAxis(0);
    }
    function zoomed() {
        var mx = d3.mouse(this);
        var mouse_time = x.invert(mx[0])
        var add = 86400000 / d3.event.scale;
        xRange = [
            new Date(+mouse_time - add * (mx[0] - l_margin) / width ),
            new Date(+mouse_time + add * (width + l_margin - mx[0]) / width )
        ];
        plotSVG(0);
    }

    function last(minutes) {
        var t1 = new Date();
        var t2 = new Date();
        t1.setMinutes(t1.getMinutes() - minutes * 60);
        return [ t1, t2 ];
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
