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
        setTimeout(startRequests, refresh * 1000);
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
                        "message": "Acknowledged on the dashboard"
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


// needed for timeSeries
// a and b are arrays of intervals: [ [min_1,max_1], [min_2,max_2], .., [min_n,max_n] ]
// the first function returns the difference a-b which again is an array of intervals
//     if a is your viewport (the data you want to display) and b your cache map
//     then you have to iterate through the result array and fetch data for every interval
// the second function returns the sum a+b which again is an array of intervals
//
// unit tests for substraction(a, b) and addition(a, b)
/*
console.log('Result: ' + addition( [[1,3],[8,10],[17,20]] , [[2,11], [14,15]] ) );
console.log('Result: ' + substraction( [[1,3],[8,10],[17,20]] , [[2,11], [14,15]] ) );
console.log('Result: ' + substraction( [[Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]], [[2,11], [14,15]] ));
console.log('Result: ' + addition( [] , [[2,11], [14,15]] ) );
console.log('Result: ' + substraction( [] , [[2,11], [14,15]] ) );
*/
// "Result: 1,11,14,15,17,20"
// "Result: 1,2,17,20"
// "Result: -Infinity,2,11,14,15,Infinity"
// "Result: 2,11,14,15"
// "Result: "

function substraction(a, b) {
    function difference(m, s) {
        if (s[1] <= m[0] || m[1] <= s[0]) return [m];
        if (s[1] <  m[1]) {
            if (s[0] <= m[0]) return [ [ s[1], m[1] ] ];
            return [ [ m[0], s[0] ], [ s[1], m[1] ] ];
        }
        if (s[0] <= m[0]) return [];
        return [ [ m[0], s[0] ] ];
    }
    function single(m, s) {
        diff = [];
        m.forEach(function(md) {
            difference(md, s).forEach(function(ret) {
                diff.push(ret);
            });
        });
        return diff;
    }
    var diff = a;
    b.forEach(function(m) {
        diff = single(diff, m);
    });
    return diff;
}

function addition(a, b) {
    function sum(m, s) {
        if (s[1] < m[0]) return [ s, m ];
        if (m[1] < s[0]) return [ m, s ];
        if (s[1] < m[1]) {
            if (s[0] <= m[0]) return [ [ s[0], m[1] ] ];
            return [ m ];
        }
        if (s[0] <= m[0]) return [ s ];
        return [ [ m[0], s[1] ] ];
    }
    var dummy = a.concat(b).sort(function(a,b) {
        return a[0] > b[0];
    });
    var result = dummy.slice();
    for (i = 1; i < dummy.length; i++) {
        var s = sum(dummy[i-1],dummy[i]);
        if (s.length==1) {
            result.splice(0,1);
            result[0] = s[0];
            dummy[i] = s[0];
        }
    }
    return result;
}
//
//
// class timeSeries
//

function timeSeries(arg) {
    // after succesful api login startRequests will be called by server
    start_.push(startRequests);
    // format defines the labeling format of the time axis 
    var format = d3.time.format.multi([
      [".%L", function(d) { return d.getMilliseconds(); }],
      [":%S", function(d) { return d.getSeconds(); }],
      ["%H:%M", function(d) { return d.getMinutes(); }],
      ["%H:00", function(d) { return d.getHours(); }],
      ["%d.%m.", function(d) { return d.getDay() && d.getDate() != 1; }],
      ["%d.%m", function(d) { return d.getDate() != 1; }],
      ["%b", function(d) { return d.getMonth(); }],
      ["%Y", function() { return true; }]
    ]);
    // tick_sizing defines the ticks for different scales
    // rework has to be done here: I want colored bands depending on 
    // hours, days weeks, month, ...
    var tick_sizing = [
        [    1.2, d3.time.seconds, 15, 'm' ],
        [    3.6, d3.time.minutes,  1, 'm' ],
        [   14.4, d3.time.minutes,  5, 'h' ],
        [   43.2, d3.time.minutes, 15, 'h' ],
        [   86.4, d3.time.minutes, 30, 'h' ],
        [  172.8, d3.time.hours,    1, 'h' ],
        [  432.0, d3.time.hours,    2, 'd' ],
        [  604.8, d3.time.hours,    6, 'd' ],
        [ 1209.6, d3.time.hours,   12, 'd' ],
        [ 2592.0, d3.time.days,     1, 'd' ],
        [ 5184.0, d3.time.days,     2, 'd' ],
        [10368.0, d3.time.days,     7, 'd' ],
        [200000.0,d3.time.months,   1, 'M' ],
        [800000.0,d3.time.years,    1, 'Y' ],
    ];
    var days = [ 'Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag' ];
    var colors = [ 'steelblue', 'red', 'green' ];
    // sizex and sizey define the parent element size
    var sizex, sizey;
    var now = new Date();
    // the elements margins
    // given as parameter? calculated automatically depending on labeling?
    // for now I leave this as is
    var margin = { top: 20, right: 20, bottom: 18, left: 50 };
    // the inner diagram dimensions
    var width, height;
    var zoom_scale = 1;

    // items contains for every itemid an object containing name, itemid and value_type
    var items = {};
    // just an array given with itemids
    // for now there's just one itemid allowed, this will change in future
    var itemids = typeof arg.itemids !== 'undefined' ? arg.itemids : null;
    var itemValueType = -1;

    // if mouseLocksOnNearest is set, the mouseover tooltip will lock on the nearest (distance) datum
    // otherwise the closest item on the time axis is used
    var mouseLocksOnNearest = typeof arg.mouseLocksOnNearest !== 'undefined' ? arg.mouseLocksOnNearest : 0;

    // initial viewport is now minus 24h
    // this should be an argument and if set the viewport should be moved (moving 24h window mode)
    // if the viewport is modified, should we go back to this mode? after what time? 
    // or should we go back after now hits the right margin?
    var xRange = last(24);
    var yRange = [0, 500]; // initial value used for a very short moment
    // the x and y objects are needed to convert vales to svg coordinates and back
    var x = d3.time.scale(),
        y = d3.scale.linear();
    var xAxis = d3.svg.axis().scale(x),
        yAxis = d3.svg.axis().scale(y).tickFormat(d3.format('s'));

    // svg is bound to given html element arg.bindTo
    var svg = d3.select(arg.bindTo)
        .append("svg");
    var bands = svg.append("g");
    // the 'future fog' element is separated from the 'past' by now
    var future = svg.append("rect")
        .attr("class", "future");

    // the axis objects
    var xA = svg.append("g")
        .attr("class", "x axis")
        .call(xAxis);
    var yA = svg.append("g")
        .attr("class", "y axis")
        .attr("transform", "translate(" + margin.left + ",0)")
        .call(yAxis);
    
    // the value's cache
    // holds anything it gets. There will soon be some mechanism throw away things
    var values = [];
    var visibleValues = [];
    var timer = 0;
    // value cache related, unused so far
    var scales = [ 'history', 'trends'];
    // this is an array of ranges (intervals) kept in the value's cache
    // it uses the functions addition and substraction
    var range  = [];
    // this is the graph: path is an array of svg elements and valueline is its description
    // for each itemid there's one graph in the array
    var sizing = [];
    var valueline = d3.svg.line()
        .x(function(d) { return Math.round(x(d[0]*1000)); })
        .y(function(d) { return Math.round(Number(y(d[1]))); })
        .interpolate("step-before"); // see http://www.d3noob.org/2013/01/smoothing-out-lines-in-d3js.html
    var path = [];
    // info consists of several elements: tooltip, circle and line
    var info = svg.append("g");
    var infoCircle = info.append("circle")
            .attr("cx", -100)
            .attr("cy", -100)
            .attr("r", 5)
            .style('opacity', '.6')
    var infoText = info.append("text")
            .attr("x", -100)
            .attr("y", -100);
    var infoBox = info.append("rect")
            .style('stroke', '#444')
            .style('stroke-width', 1)
            .style('fill', '#ccc')
            .style('opacity', 0.4);
    var infoLine = info.append("line")
            .style('stroke-width', 2)
            .style('stroke', '#ccc');
    var zoom = d3.behavior.zoom()
            .scaleExtent([.000001, 1000])
            .on("zoom", zoomed)
            .on("zoomend", function() {
                console.log('zoomend');
                startRequests();
            });
    // the diagram has two behaviors: drag and zoom
    // drag shouldn't be used here as panning is part of zooming, but
    // I didn't got it working....
    var drag = d3.behavior.drag()
            .on("dragstart", function() {
                d3.event.sourceEvent.stopPropagation();
            })
            .on("drag", dragged);
    // this is just for the tooltip
    // mind the difference 'mouseleave' and 'mouseout'!
    svg
        .on('mousemove', plotInfo)
        .on('mouseleave', function() {
            infoCircle.attr("cx", -100).attr("cy", -100);
            infoBox.attr("x", -100).attr("y", -100);
            infoText.attr("x", -100).attr("y", -100);
            infoLine.attr("y2", margin.top);
        })
        .call(zoom)
        .call(drag);

    // plot empty diagram for the first time (just plot everything)
    plotSVG();
    // jquery here for the resize event, just plot everything
    $(window).resize(function() {
        plotSVG();
    });

    // this first api call (item.get) is needed to figure out if
    // item is integer, float, text, ...
    // if the variable 'history' isn't correctly provided history.get won't return anything
    // here we get the item name as well.
    // Todo: do some regexp magic to construct the visible name from name and key
    // (in the zabbix gui it's done with php)
    function getItemValueTypes() {
        req('item.get', {
            'output': [ 'name', 'value_type', 'key_' ],
            'itemids': itemids
        }, function(r) {
            if (r.result.length>0) {
                r.result.forEach(function(o, i) {
                    items[o.itemid] = { 'index': i, 'name': o.name, 'key': o.key_, 'value_type': o.value_type };
                    values[i] = [];
                    path[i] = svg.append("path")
                        .style('stroke', colors[i])
                        .style('stroke-width', 1)
                        .style('fill', 'none');
                });
                itemValueType = Number(r.result[0].value_type);
                startRequests();
            } else {
                console.log('Error: Look if trigger exists.');
            }
        }, 0);
    }

   // do the api call for values not in the cache
   function startRequests() {
        if (itemValueType == -1) {
            getItemValueTypes();
            return;
        }
        // substraction returns an array of ranges (intervals)
        // if you're having several holes in your data cache, this will just
        // request the minimum needed.
        substraction( [ [xRange[0], xRange[1]] ], range).forEach(function(r, i) {
            req('history.get', {
                "output": 'extend',
                "history": itemValueType,
                "itemids": itemids,
                "sortfield": "clock",
                "sortorder": "ASC",
                "time_from": Math.round(r[0]/1000),
                "time_till": Math.round(r[1]/1000)
            }, onData, 0);
        });
    }

    // callback for history.get
    function onData(response, status) {
        // remove doublicates from array
        function uniq(a) {
            var seen = {};
            return a.filter(function(item) {
                return seen.hasOwnProperty(item[0]) ? false : (seen[item[0]] = true);
            });
        }
        response.result.forEach(function(o) {
            var i = items[o.itemid].index;
            values[i].push([Number(o.clock), Number(o.value)]);
        });
        var received = [
            new Date (response.result[0].clock*1000),
            new Date (response.result[response.result.length-1].clock*1000)
        ];
        range = addition(range, [ received ] );
        itemids.forEach(function(item, i) {
            values[i] = values[i].sort(function(a,b) {  // Fix me: this slows down everything
                return a[0] > b[0];
            });
        });
        // replot all
        plotSVG();
    }

    // rebuild axis objects
    function plotAxis() {
        x.range([margin.left, width + margin.left]).domain(xRange);
        var x0 = Math.round(xRange[0]/1000)
        var x1 = Math.round(xRange[1]/1000)
        var min = Number.POSITIVE_INFINITY;
        var max = Number.NEGATIVE_INFINITY;
        var a, b;
        values.forEach(function(v) {
            for (var i=v.length-1; i>=0; i--) {
            a = v[i][0];
            b = Number(v[i][1]);
                if (x0 < a && a < x1) {
                    if (b < min) min = b;
                    if (b > max) max = b;
                }
            }
        });
        yRange = [0,max];
        y.range([height - margin.bottom, margin.top]).domain(yRange).nice();

        var Range = (xRange[1]-xRange[0]) / 1000;
        sizing = [];
        tick_sizing.forEach(function(ts) {
            if (ts[0] >= Range/width && sizing.length == 0)
                sizing = ts;
        });
        xAxis
            .orient("bottom")
            .tickFormat(format)
            .tickSize(-height + margin.bottom + margin.top)
            .ticks(sizing[1], sizing[2]);
        yAxis
            .orient("left")
            .tickSize(-width+1);
        xA  .attr("transform", "translate(0," + (height - margin.bottom) + ")")
            .call(xAxis)
            .selectAll("text")
            .style("text-anchor", "end")
            .attr("dx", "-0.2em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(-90)");
        yA.call(yAxis);
    }

    function createBands(size) {
        var incr, firstFull;
        var intervals = [];
        if (size == 'm') incr = 60000;
        if (size == 'h') incr = 3600000;
        if (size == 'd' || size == 'M') {
            incr = 86400000;
            firstFull = Math.floor(xRange[0]/incr)*incr;
            var d = new Date(firstFull);
            firstFull = firstFull - d.getHours()*3600000;
        } else {
            firstFull = Math.floor(xRange[0]/incr)*incr;
        }
        if (size != 'M') while (firstFull < xRange[1]) {
            var a = firstFull;
            var b = firstFull + incr;
            if (a < xRange[0]) a = +xRange[0];
            if (b > xRange[1]) b = +xRange[1];
            intervals.push([a,b]);
            firstFull = firstFull + incr;
        } else {
            var last = xRange[0];
            while (firstFull < xRange[1]) {
                firstFull = firstFull + incr;
                var a = new Date(firstFull);
                if (a.getDate() == 1) {
                    intervals.push([last,a]);
                    last = a;
                }
            }
            intervals.push([last,+xRange[1]]);
        }
        return intervals;
    }

    function plotBands(clss, timeInterval, intervals, y, h) {
        function labelDay(d) {
            var a = new Date(d[0]);
            var pixels = x(d[1]) - x(d[0]);
            if (pixels > 120) return days[a.getDay()] + ', ' + a.getDate() + '.' + (a.getMonth()+1) + '.';
            if (pixels > 70) return days[a.getDay()];
            if (pixels > 20) return days[a.getDay()].substr(0,2);
            if (pixels > 10) return days[a.getDay()].substr(0,1);
            else return '';
        }
        var timeBands = bands.selectAll('.'+clss)
            .data(intervals, function(d) { return (d[0]+','+d[1]); })
            .attr('x', function(d) { return Math.round(x(d[0])); })
            .attr('y', y)
            .attr('width', function(d) { return Math.round(x(d[1])-x(d[0])); })
            .attr('height', h);
        var bandsEnter = timeBands.enter()
            .append("rect")
            .attr('x', function(d) { return Math.round(x(d[0])); })
            .attr('y', y)
            .attr('width', function(d) { return Math.round(x(d[1])-x(d[0])); })
            .attr('height', h)
            .attr('class', function(d) {
                var a = new Date(d[0]);
                if (timeInterval == 'h') {
                    if (a.getHours() % 2 == 0) return clss+' hours_even'; else return clss+' hours_odd';
                } else if (timeInterval == 'm') {
                    if (a.getMinutes() % 2 == 0) return clss+' minutes_even'; else return clss+' minutes_odd';
                } else if (timeInterval == 'd') {
                    if (a.getDay() == 0 || a.getDay() == 6) return clss+' weekend';
                    else return clss+' workday';
                } else if (timeInterval == 'M') {
                    if (a.getMonth() % 2 == 0) return clss+' months_even';
                    else return clss+' months_odd';
                }
            });
        timeBands.exit().remove();
        if (clss == 'daybands') {
            var plot = true;
            var timeDesc = bands.selectAll(".days")
                .data(intervals, function(d) { return ( d[0]+','+d[1] ); })
                .attr('x', function(d) { return Math.round(x(d[0])); })
                .attr('y', function(d) { return margin.top - 4; })
                .text(labelDay);
            var descEnter = timeDesc.enter()
                .append("text")
                .attr('x', function(d) { return Math.round(x(d[0])); })
                .attr('y', function(d) { return margin.top - 4; })
                .attr('class', 'days')
                .text(labelDay);
            timeDesc.exit().remove();
        }
    }

    function plotTimeBands() {
        var timeInterval = sizing[3];
        var intervals = createBands(timeInterval);
        plotBands('bands', timeInterval, intervals, margin.top, height - margin.bottom - margin.top);
        if (timeInterval != 'd') intervals = createBands('d');
        plotBands('daybands', 'd', intervals, 0, margin.top);
    }

    function plotFuture(t) {
        now = new Date();
        // plot 'fog of future' if it's in viewport
        // and upate it every second
        // 10s after each minute do an api request
        // Todo: if 'now' hits right border move the viewport
        if (x(now) < width + margin.left) {
            future
                .attr("x", Math.round(x(now)))
                .attr("y", margin.top)
                .attr("width", width + margin.left - Math.round(x(now)))
                .attr("height", height - margin.bottom - margin.top);
            if (timer > 0 && t == 1 || timer == 0 && t == 0) {
                timer = setTimeout(function() { plotFuture(1); }, 1000);
                if (now.getSeconds()==10) startRequests();
            }
        } else if (timer > 0) {
            future
                .attr("x", width + margin.left)
                .attr("width", 0);
            timer = 0;
        }
    }

    // reassign an new path description to the path object
    function plotData() {
        var x0 = Math.round(xRange[0]/1000)
        var x1 = Math.round(xRange[1]/1000)
        path.forEach(function(p, i) {
            // only use values in current viewport
            visibleValues[i] = values[i].filter(function(o) {
                if (o[0] >= x0 && o[0] <= x1) return true;
                else return false;
            });
            p.attr("d", valueline(visibleValues[i]));
        });
    }

    // replot tooltip
    function plotInfo() {
        mx = d3.mouse(this)[0];
        my = d3.mouse(this)[1];
        mv = +x.invert(mx)/1000;
        var selected = [];
        if (mouseLocksOnNearest) {
            selected[0] = [Number.POSITIVE_INFINITY];
            visibleValues.forEach(function(v, i) {
                v.map(function(o) {
                    return [ Math.abs(+x(o[0]*1000)-mx) + Math.abs(+y(o[1])-my), o[0], o[1], i ];
                }).forEach(function(o) {
                    if (o[0] < selected[0][0]) selected[0] = o;
                });
            });
        } else {
            visibleValues.forEach(function(v, i) {
                selected[i] = [Number.POSITIVE_INFINITY];
                v.map(function(o) {
                    return [ Math.abs(+x(o[0]*1000)-mx), o[0], o[1], i ];
                }).forEach(function(o) {
                    if (o[0] < selected[i][0]) selected[i] = o;
                });
            });
        }
        // Todo: if mouseLocksOnNearest unset, create a circle for every graph and plot all values
        var date = new Date(Math.round(selected[0][1]/60)*60000);
        if (selected[0] !== 'undefined') {
            var text = format(date) + ', ' + selected[0][2];
            infoCircle
                .attr("cx", x(selected[0][1]*1000))
                .attr("cy", y(selected[0][2]))
                .style("fill", colors[selected[0][3]]);
            infoBox
                .attr("x", mx+12)
                .attr("y", my+9)
                .attr("width", (text.length * 7 + 2))
                .attr("height", 20);
            infoText
                .attr("x", mx+14)
                .attr("y", my+24)
                .style("stroke", colors[selected[0][3]])
                .style("stroke-width", 0.5)
                .text(text);
            infoLine
                .attr("x1", x(selected[0][1]*1000))
                .attr("y1", margin.top)
                .attr("x2", x(selected[0][1]*1000))
                .attr("y2", height-margin.top);
        }
    }

    // replot all function
    function plotSVG() {
        sizex = $(arg.bindTo).width();
        sizey = $(arg.bindTo).height();
        svg .attr("width", sizex)
            .attr("height", sizey);
        width = sizex - margin.left - margin.right,
        height = sizey - margin.top - margin.bottom;
        plotAxis();
        plotFuture(0);
        plotTimeBands();
        // don't plot graph without values
        if (values[0] !== undefined) {
            plotData();
        }
    }

    // rearrange xaxis during dragging (panning done here)
    function dragged(d) {
        var move = +x.invert(d3.event.x) - x.invert(d3.event.x - d3.event.dx);
        xRange = [
            new Date(+xRange[0] - move),
            new Date(+xRange[1] - move)
        ];
        plotAxis();
    }
    // zoom (without panning)
    function zoomed() {
        var mx = d3.mouse(this);
        var mouse_time = x.invert(mx[0])
        zoom_scale = d3.event.scale;
        var add = 86400000 / zoom_scale;
        xRange = [
            new Date(+mouse_time - add * (mx[0] - margin.left) / width ),
            new Date(+mouse_time + add * (width + margin.left - mx[0]) / width )
        ];
        plotSVG();
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

//
// class itemGauge
//

function itemGauge(arg) {
    var bindToId = arg.bindToId;
    var itemid = typeof arg.itemid !== 'undefined' ? arg.itemid : 0;
    var refresh = 30000;
    var size = typeof arg.size !== 'undefined' ? arg.size : 120;
    var config = { size: size };

    if (typeof arg.label !== 'undefined') config.label = arg.label;
    if (typeof arg.min !== 'undefined') config.min = arg.min;
    if (typeof arg.max !== 'undefined') config.max = arg.max;
    if (typeof arg.minorTicks !== 'undefined') config.minorTicks = arg.minorTicks;
    if (typeof arg.greenZones !== 'undefined') config.greenZones = arg.greenZones;
    if (typeof arg.yellowZones !== 'undefined') config.yellowZones = arg.yellowZones;
    if (typeof arg.redZones !== 'undefined') config.redZones = arg.redZones;

    start_.push(startRequests);

    var method = 'item.get';

    var params = {
        'itemids': itemid,
        'output': [ 'itemid', 'lastvalue', 'delay'],
        'limit': 1
    };

    function startRequests() {
        console.log('starting requests for itemGauge');
        req(method, params, successMethod, errorMethod);
        setTimeout(startRequests, refresh);
    }

    function errorMethod() {
        console.log('itemGauge request failed');
        d3.select (bindToId).selectAll ("div.alert").style ('opacity', '0.5');
    }

    function successMethod(response, status) {
        var result = response.result[0];
        console.log('itemGauge success');
        gauge.redraw(result.lastvalue);
        refresh = result.delay == 0 ? refresh : 1000 * result.delay;
    }

    var gauge = new Gauge(bindToId, config);
    gauge.render();
}
