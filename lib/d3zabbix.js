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
        return jqzabbix.sendAjaxRequest(method, params, ok, nok);
    }
    function onError(a) {
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

//
// imageReload()
// a simple function for flickerfree image reloads in dashboards
//
// Provide the image's container id (not the id of the image itself) and the
// refresh interval in seconds. After each timeout the image url will be
// modified by appending '&refresh=<ts>' and then reloaded in the background.
// As soon as the image is loaded it will be replaced resulting in flickerfree
// image updates. This works with one image per element only.
//
function imageReload(id, refresh) {
    function reload() {
        var url = $(id+'>img')[0].src;
        var ts = new Date();
        if (url.match(/refresh=.*/)) {
            url = url.replace(/refresh=.*/, "refresh="+(+ts));
        } else {
            url = url + "&refresh="+(+ts);
        }
        var temp = $('<img>');
        temp.attr("src", url).css("display", "none");
        $(id).prepend(temp);
        temp.load(function() {
            $(id+'>img').not(this).remove();
            $(this).css("display", "block");
        });
        setTimeout(reload, refresh * 1000);
    }
    setTimeout(reload, refresh * 1000);
}

// needed for timeSeries
// a and b are arrays of intervals: [ [min_1,max_1], [min_2,max_2], .., [min_n,max_n] ]
// the difference function returns the difference a-b which again is an array of intervals
//     if a is your viewport (the data you want to display) and b your cache map
//     then you have to iterate through the result array and fetch data for every interval
// the addition function returns the sum a+b which again is an array of intervals
// the intersection function returns the intersection of a and b which is an array of intervals
// the iLength function returns the sum (scalar) of a's interval length
//
// unit tests for substraction(a, b), intersection(a, b) and addition(a, b)
/*
console.log('Result: ' + addition( [[1,3],[8,10],[17,20]] , [[2,11], [14,15]] ) );
console.log('Result: ' + substraction( [[1,3],[8,10],[17,20]] , [[2,11], [14,15]] ) );
console.log('Result: ' + intersection(  [[1,3],[8,10],[17,20]] , [[2,11], [14,15]] ) );
console.log('Result: ' + substraction( [[Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]], [[2,11], [14,15]] ));
console.log('Result: ' + addition( [] , [[2,11], [14,15]] ) );
console.log('Result: ' + substraction( [] , [[2,11], [14,15]] ) );
console.log('Result: ' + iLength([[1,3],[8,10],[17,20]] ));
console.log('Result: ' + iLength([[Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]]));
*/
// "Result: 1,11,14,15,17,20"
// "Result: 1,2,17,20"
// "Result: 2,3,8,10"
// "Result: -Infinity,2,11,14,15,Infinity"
// "Result: 2,11,14,15"
// "Result: "
// "Result: 7"
// "Result: Infinity"

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
    if (a === undefined || b === undefined) return [];
    var diff = a;
    b.forEach(function(m) {
        diff = single(diff, m);
    });
    return diff;
}

function intersection(a, b) {
    if (a === undefined || b === undefined) return [];
    var b_inverse = substraction([[Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]], b);
    return substraction(a,b_inverse);
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
    if (a === undefined || b === undefined) return [];
    var dummy = a.concat(b).sort(function(a,b) {
        return a[0] - b[0];
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

function iLength(a) {
    var length = 0;
    a.forEach(function(o) {
        length = length + Number(o[1]) - Number(o[0]);
    });
    return length;
}

//
// getIndex(<array of items>, value)
//
// a binary search on an array of arrays where the first element is
// being searched for and which must be sorted in ascending order.
// The return value is an array with three indeces:
// [0] the index of the previous element next to value
// [1] the index of the following element next to value
// [2] the index of the element closest to value
// * if the value matches, all three indeces are equal
// * if there's no previous or following neighbour -1 is returned
// * if the the given array is non-empty there are at least two valid
//   indeces in the resulting array
//
function getIndex(items, value) {
    var startIndex  = 0,
        stopIndex   = items.length - 1,
        middle      = Math.floor((stopIndex + startIndex)/2),
        floor       = -1,
        ceil        = -1;
    if (items === undefined || items[0] === undefined) return [-1,-1,-1];
    if (value <= items[startIndex][0]) return [ -1, 0, 0 ];
    if (value >= items[stopIndex][0]) return [ stopIndex, -1, stopIndex ];
    while (items[middle][0] != value && startIndex < stopIndex) {
        if (value < items[middle][0]) {
            stopIndex = middle - 1;
            ceil = middle;
        } else if (value > items[middle][0]) {
            startIndex = middle + 1;
            floor = middle;
        }
        middle = Math.floor((stopIndex + startIndex)/2);
    }
    if (value <= items[middle][0]) ceil = middle;
    if (value >= items[middle][0]) floor = middle;
    if (floor == -1) return [ floor, ceil, ceil ];
    if (ceil == -1) return [ floor, ceil, floor ];
    if (value-items[floor][0] < items[ceil][0] - value) return [ floor, ceil, floor ];
    else return [ floor, ceil, ceil ];
}
/*
var test = [ [1], [2], [8], [10], [10], [12], [19] ];
console.log(getIndex(test, 0));
console.log(getIndex(test, 1));
console.log(getIndex(test, 2));
console.log(getIndex(test, 3));
console.log(getIndex(test,10));
console.log(getIndex(test,15));
console.log(getIndex(test,20));
*/

// reminds me that I want to provide standard bank holidays
function Easter(Y) {
    var C = Math.floor(Y/100);
    var N = Y - 19*Math.floor(Y/19);
    var K = Math.floor((C - 17)/25);
    var I = C - Math.floor(C/4) - Math.floor((C - K)/3) + 19*N + 15;
    I = I - 30*Math.floor((I/30));
    I = I - Math.floor(I/28)*(1 - Math.floor(I/28)*Math.floor(29/(I + 1))*Math.floor((21 - N)/11));
    var J = Y + Math.floor(Y/4) + I + 2 - C + Math.floor(C/4);
    J = J - 7*Math.floor(J/7);
    var L = I - J;
    var M = 3 + Math.floor((L + 40)/44);
    var D = L + 28 - 31*Math.floor(M/4);

    return M + '.' + D;
}

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
      ["%d.%m.", function(d) { return d.getDate() != 1; }],
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
    ];
    var sizing = [];
    var units;
    // TODO: use locale somehow....
    var days = [ 'Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag' ];
    var colors = [ 'steelblue', 'red', 'green' ];
    // sizex and sizey define the parent element size
    var sizex, sizey;
    // the elements margins
    // given as parameter? calculated automatically depending on labeling?
    // for now I leave this as is
    var margin = { top: 20, right: 20, bottom: 18, left: 50 };
    // the inner diagram dimensions
    var width, height;
    var zoom_scale = 1;
    var zooming = false;
    var hideLegend = typeof arg.hideLegend !== 'undefined' ? arg.hideLegend : false;
    var preFetch = typeof arg.preFetch !== 'undefined' ? arg.preFetch: 1;

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
    var bands = svg.append("g")
        .attr("class", "timebands");
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
    var visibleValues = [];
    var timer = 0;

    // if zoom_scale is lower than this use trends
    var trends_scale = 0.3;
    var activeScale = 0;
    var trendsSupported = true;
    // Zabbix value_types:
    // 0 - numeric float;
    // 1 - character;
    // 2 - log;
    // 3 - numeric unsigned;
    // 4 - text.
    var data_type = [ 'n', 'c', 'c', 'n', 'c' ];
    // a value cache for every scale:
    var scales = [
        {   'method': 'history.get',
            'values': [],        // the value cache for this scale
            'range': [],         // this is an array of ranges (intervals) kept in the value's cache
                                 // it uses the functions addition and substraction
            'requestedRange': [],// the intervals for every request made until response (unused)
            'resolution': 60,
            'valueline': d3.svg.line()
                .x(function(d) { return Math.round(x(d[0]*1000)); })
                .y(function(d) { return Math.round(Number(y(d[1]))); })
                .interpolate('step-before') // see http://www.d3noob.org/2013/01/smoothing-out-lines-in-d3js.html
        },
        {   'method': 'trends.get',
            'values': [],
            'range': [],
            'resolution': 3600,
            'requestedRange': [],
            'valueline': d3.svg.line()
                .x(function(d) { return Math.round(x(d[0]*1000)); })
                .y(function(d) { return Math.round(Number(y(d[1]))); })
                .interpolate('cardinal')
        }
    ];

    // this is the graph: path is an array of svg elements and valueline is its description
    // for each itemid there's one graph in the array
    var path = [];
    var path_minmax = [];
    var gant = [];
    var gantLayers = 0;
    var gantKeyWords = ['started', 'ended'];
    // info consists of several elements: tooltip, circle and line
    var yLabel = yA.append("text")
            .style("text-anchor", "end")
            .attr("transform", "translate(-40,"+margin.top+") rotate(-90)")
    // TODO: rename plotArea, it's only path
    var plotArea = svg.append("g").attr("class", "path");
    var gantChart = svg.append("g").attr("class", "gant");
    var gantInfo = false; // holds info for current tooltip
    var legendBox = svg.append("rect")
            .attr('class', 'legendback');
    var legend = svg.append("g").attr("class", "legend");
    var hideROverlap = svg.append("rect");
    var info = svg.append("g").attr("class", "info");
    var infoBox = info.append("rect").attr("class", "info");
    var zoom = d3.behavior.zoom()
            .scaleExtent([.0005, 1000])
            .on("zoom", zoomed)
            .on("zoomend", function() {
                startRequests();
                dragging = false;
            });
    // the diagram has two behaviors: drag and zoom
    // drag shouldn't be used here as panning is part of zooming, but
    // I didn't got it working....
    var dragging = false;
    var drag = d3.behavior.drag()
            .on("dragstart", function() {
                dragging = true;
                d3.event.sourceEvent.stopPropagation();
            })
            .on("drag", dragged);
    // this is just for the tooltip
    // mind the difference 'mouseleave' and 'mouseout'!
    svg
        .on('mousemove', plotInfo)
        .on('mouseleave', clearInfo)
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
    // TODO: do some regexp magic to construct the visible name from name and key
    // (in the zabbix gui it's done with php)
    function getItemValueTypes() {
        req('item.get', {
            'output': [ 'name', 'value_type', 'units', 'key_' ],
            'itemids': itemids
        }, function(r) {
            if (r.result.length>0) {
                r.result.forEach(function(o, i) {
                    items[o.itemid] = {
                        'index': i, 'name': o.name, 'key': o.key_,
                        'units': o.units, 'value_type': o.value_type,
                        'data_type': data_type[o.value_type] };
                    scales.forEach(function(o,j) {
                        scales[j].values[i] = [];
                    });
                    gant[i] = [];
                    if (data_type[o.value_type] == 'n') {
                        path_minmax[i] = plotArea.append("path")
                            .attr("class", "path"+i+" minmax")
                            .style('fill', colors[i]);
                        path[i] = plotArea.append("path")
                            .attr("class", "path"+i+" normal")
                            .style('stroke', colors[i]);
                    }
                    if (units === undefined) units = o.units;
                    else if (units != o.units)
                        console.log('Error: items have different units.');
                });
                itemValueType = Number(r.result[0].value_type);
                if (units !== undefined) yLabel.text("["+units+"]");
                startRequests();
            } else {
                console.log('Error: Look if item exists.');
            }
        }, 0);
    }

   // do the api call for values not in the cache
   function startRequests() {
        if (itemValueType == -1) {
            getItemValueTypes();
            return;
        }
        if (trendsSupported && zoom_scale < trends_scale && data_type[itemValueType] == 'n') activeScale = 1;
        else activeScale = 0;
        // substraction returns an array of ranges (intervals)
        // if you're having several holes in your data cache, this will just
        // request the minimum needed.
        var now = new Date();
        scales[activeScale].requestedRange.forEach(function(o,i) {
            if ((+now-o[2])>5000) { // remove requested ranges after 5s
                scales[activeScale].requestedRange.splice(i,1);
            }
        });
        // prefetching
        var x0 = +xRange[0] - (+xRange[1] - xRange[0]) * preFetch;
        var x1 = +xRange[1] + (+xRange[1] - xRange[0]) * preFetch;
/*      var dontRequest = addition(scales[activeScale].range, []);
        console.log(''+scales[activeScale].range); // requestedRanges unused so far, there's still a bug here
        console.log(''+scales[activeScale].requestedRange);
        console.log(''+dontRequest);
        console.log(''+substraction( [ [xRange[0], xRange[1]] ], dontRequest));*/
        substraction( [[ x0, x1 ]], scales[activeScale].range).forEach(function(r, i) {
            req(scales[activeScale].method, {
                "output": 'extend',
                "history": itemValueType,
                "itemids": itemids,
                "sortfield": "clock",
                "sortorder": "ASC",
                "time_from": Math.round(r[0]/1000),
                "time_till": Math.round(r[1]/1000)
            }, onData, onError);
            scales[activeScale].requestedRange.push([r[0], r[1], now]);
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
        var received_scale;
        if (response.result.length > 0 && response.result[0] !== undefined) {
            var cast;
            var data_type = items[response.result[0].itemid].data_type;
            if (data_type == 'n')
                cast = function(v) { return Number(v); } // normal charts
            else
                cast = function(v) { return String(v); } // gant graphs
            if (response.result[0].value !== undefined) {
                receivedScale = 0;
                response.result.forEach(function(o) {
                    var i = items[o.itemid].index;
                    scales[receivedScale].values[i].push([Number(o.clock), cast(o.value)]);
                });
                // console.log('history values: ' + response.result.length);
            } else if (response.result.length > 0 && response.result[0].value_avg !== undefined) {
                receivedScale = 1;
                response.result.forEach(function(o) {
                    var i = items[o.itemid].index;
                    scales[receivedScale].values[i].push([Number(o.clock), Number(o.value_avg), Number(o.value_min), Number(o.value_max), ]);
                });
                // console.log('trend values: ' + response.result.length);
            } else return;
            var received = [
                new Date (response.result[0].clock*1000),
                new Date (response.result[response.result.length-1].clock*1000)
            ];
            scales[receivedScale].range = addition(scales[receivedScale].range, [ received ] );
            // TODO: merging the new data can be done in a smarter way.
            itemids.forEach(function(item, i) {
                scales[receivedScale].values[i] = uniq(scales[receivedScale].values[i].sort(function(a,b) {
                    return a[0] - b[0];
                }));
            });
            // replot all
            if (data_type == 'c')
                updateGants();
            plotSVG();
        } else {
//            no data ?
//            console.log('unknown response: ');
//            console.log(response);
        }
    }

    function onError(response) {
        if (trendsSupported && activeScale==1 && (response === undefined || response.status==500)) {
            d3.select(arg.bindTo)
                .append("div")
                .attr('class', 'warning')
                .html("The zabbix api doesn't support 'trends.get()'.<br>"+
                      "See <a href=\"https://support.zabbix.com/browse/ZBXNEXT-1193\">https://support.zabbix.com/browse/ZBXNEXT-1193</a>");
            trendsSupported = false;
        }
    }

    function updateGants() {
        // addGant() adds a layer to every bar to use a minimal number of rows without overlapping
        function addGant(a, begin, end, name) {
            var layer = -1;
            for (i=0; i<layers.length; i++) if (intersection(layers[i], [[begin,end]]).length == 0) {
                layer = i;
                break;
            }
            if (layer == -1) {
                layer = layers.length;
                layers[layer] = [];
            }
            layers[layer] = addition(layers[layer],[[begin,end]]);
            a.push([begin, end, name, layer]);
        }
        // create GantArray
        // TODO: should be done elsewhere
        var left  = new RegExp(' '+gantKeyWords[0]);
        var right = new RegExp(' '+gantKeyWords[1]);
        var layers = [];
        var now = Math.round(new Date()/1000);
        gant.forEach(function(g, i) {
            var gantNames = {};
            gant[i] = [];
            scales[activeScale].values[i].forEach(function(v,j) {
                var name='', begin=false, end=false;
                if (v[1].search(left) > -1) {
                    name = v[1].replace(left,'');
                    begin = true;
                } else if (v[1].search(right) > -1) {
                    name = v[1].replace(right,'');
                    end = true;
                }
                if (!gantNames.hasOwnProperty(name)) {
                    if (begin) gantNames[name] = v[0];
                    else if (end) gantNames[name] = v[0];
                    else addGant(gant[i], v[0], v[0], name);
                } else {
                    if (begin) { // TODO: this is wrong
                        addGant(gant[i], v[0], gantNames[name], name);
                    } else if (end) {
                        addGant(gant[i], gantNames[name], v[0], name);
                    }
                    delete gantNames[name];
                }
            });
        });
        gantLayers = layers.length;
    }

    // create arrays containing just visible values
    // and return maximum on y-axis
    function updateVisibleValues(x0, x1) {
        var max = Number.NEGATIVE_INFINITY;
        var maxIndex = 1;
        if (activeScale > 0) maxIndex = 3;
        path.forEach(function(p, i) {
            // only use values in current viewport
            if (scales[activeScale].values[i].length == 0) return 0;
            var left  = getIndex(scales[activeScale].values[i], x0);
            var right = getIndex(scales[activeScale].values[i], x1);
            if (left[0]  == -1) left  = left[1];  else left  = left[0];
            if (right[1] == -1) right = right[0]; else right = right[1];
            visibleValues[i] = scales[activeScale].values[i].slice(left,right+1);
            // TODO: project next points out of view on y-axis
            var ax = visibleValues[i][0][0];
            // var ay = visibleValues[i][0][1];
            // var bx = visibleValues[i][1][0];
            // var by = visibleValues[i][1][1];
            // don't modify visibleValues: it is a reference on the original data!
            // if (bx > ax) visibleValues[i][0] = [ x0, ay + (x0-ax)/(bx-ax)*(by-ay) ];
            visibleValues[i].forEach(function(o) {
                var b = Number(o[maxIndex]);
                if (b > max) max = b;
            });
        });
        return max;
    }

    // rebuild axis objects
    function plotAxis() {
        x.range([margin.left, width + margin.left]).domain(xRange);
        var x0 = Math.round(xRange[0]/1000)
        var x1 = Math.round(xRange[1]/1000)
        var cacheRate = [];
        cacheRate[0] = Math.round(iLength(intersection(scales[0].range,[[xRange[0],xRange[1]]])) * 100 / iLength([[xRange[0],xRange[1]]]));
        cacheRate[1] = Math.round(iLength(intersection(scales[1].range,[[xRange[0],xRange[1]]])) * 100 / iLength([[xRange[0],xRange[1]]]));
        if (trendsSupported && zoom_scale < trends_scale) activeScale = 1;
        else activeScale = 0;
        // during dragging show original data as long as it fills more than 10% of viewport
        // else 5% more data in next lower resolution is needed to fall back to it
        var cor = 1.05;
        if (dragging) cor = 10;
        if (activeScale == 0 && cacheRate[0] * cor < cacheRate[1]) activeScale = 1;
        if (activeScale == 1 && cacheRate[1] * cor < cacheRate[0]) activeScale = 0;
        var max = updateVisibleValues(x0, x1);
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
        var dst = 0;
        var firstOffset = 0;
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
        if (size == 'd') {
            var time = new Date(firstFull);
            firstOffset = time.getTimezoneOffset();
            dst = (xRange[1].getTimezoneOffset() - firstOffset);
        }
        if (size != 'M') while (firstFull < xRange[1]) {
            var a = firstFull;
            var b = firstFull + incr;
            if (a < xRange[0]) a = +xRange[0];
            if (b > xRange[1]) b = +xRange[1];
            if (a < b) intervals.push([a,b]);
            firstFull = firstFull + incr;
        } else {
            var last = xRange[0];
            while (firstFull < xRange[1]) {
                firstFull = firstFull + incr;
                var a = new Date(firstFull);
                if (a.getDate() == 1) {
                    if (last < a) intervals.push([last,a]);
                    last = a;
                }
            }
            if (last < +xRange[1]) intervals.push([last,+xRange[1]]);
        }
        if (dst!=0) {
            return intervals.map(function(o,i) {
                var t0 = new Date(o[0]);
                var t1 = new Date(o[1]);
                var o0 = (t0.getTimezoneOffset() - firstOffset) * 60000;
                var o1 = (t1.getTimezoneOffset() - firstOffset) * 60000;
                return [ o[0]+o0, o[1]+o1 ];
            });
        }
        return intervals;
    }

    function plotBands(clss, timeInterval, intervals, y, h) {
        function labelDay(d) {
            var a = new Date(d[0]);
            var pixels = x(d[1]) - x(d[0]);
            if (pixels > 160) return days[a.getDay()] + ', ' + a.getDate() + '.' + (a.getMonth()+1) + '.' + (a.getFullYear());
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
                    var day = a.getDay();
                    if (day == 0 || day == 6) {
                        return clss+' weekend';
                    } else {
                        if (day%2 == 0) return clss+' workday_even';
                        else return clss+' workday_odd';
                    }
                } else if (timeInterval == 'M') {
                    if (a.getMonth() % 2 == 0) return clss+' months_even';
                    else return clss+' months_odd';
                }
            });
        timeBands.exit().remove();
        if (clss == 'daybands') {
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
        if (timeInterval == 'M' || timeInterval == 'Y') intervals = [];
        else if (timeInterval != 'd') intervals = createBands('d');
        plotBands('daybands', 'd', intervals, 0, margin.top);
    }

    function plotFuture(t) {
        now = new Date();
        if (now < xRange[0]) now = xRange[0];
        // plot 'fog of future' if it's in viewport
        // and upate it every second
        // 10s after each minute do an api request
        // TODO: if 'now' hits right border move the viewport
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
    function plotPath() {
        var x0 = Math.round(xRange[0]/1000);
        var x1 = Math.round(xRange[1]/1000);
        // set the data resolution depending on zoom level (zoom_scale)
        // TODO: use real pixels per datum not zoom_scale
        path.forEach(function(p, i) {
            p.attr("d", scales[activeScale].valueline(visibleValues[i]));
            if (activeScale > 0) {
                var min = visibleValues[i].map(function(arr) {
                    return [ arr[0], arr[2] ];
                });
                var max = visibleValues[i].map(function(arr) {
                    return [ arr[0], arr[3] ];
                });
                path_minmax[i].attr("d", scales[1].valueline(min.concat(max.reverse())));
            } else {
                path_minmax[i].attr("d", scales[0].valueline([]));
            }
        });
        hideROverlap
            .attr('fill', '#ffffff')
            .attr('x', width + margin.left + 1)
            .attr('y', 0)
            .attr('width', margin.right-1)
            .attr('height', height - margin.top);
    }

    function plotGant() {
        function setGant(selection) {
            selection
                .attr("x", function(d,i) {
                    return Math.round(x(d[0]*1000));
                })
                .attr("y", function(d,i) {
                    return margin.top + gantHeight*d[3] + 4;
                })
                .attr("width", function(d,i) {
                    var width = Math.ceil(x(d[1]*1000)-x(d[0]*1000));
                    if (width<0) return 0;
                    return width;
                })
                .attr("height", function(d,i) {
                    return gantHeight - 2;
                })
                .attr("opacity", function(d,i) {
                    var width = x(d[1]*1000)-x(d[0]*1000);
                    if (width >= 1 || width < 0) return 1;
                    return width;
                });
        }
        var gantHeight = Math.round((height - margin.top - margin.bottom - 8)/gantLayers);
        if (gantHeight > 20) gantHeight = 20;
        var x0 = Math.round(xRange[0]/1000);
        var x1 = Math.round(xRange[1]/1000);
        // TODO: only one item used for gants
        var visibleGant = [];
        gant[0].forEach(function(g,i) {
            var g0 = g[0];
            var g1 = g[1];
            if (g[1] < x0) return;
            if (g[0] > x1) return;
            if (g[0] < x0) g0 = x0;
            if (g[1] > x1) g1 = x1;
            visibleGant.push([g0, g1, g[2], g[3]]);
        });
        var gC = gantChart.selectAll("rect").data(visibleGant, function(o,i) {
                return o[2]+o[0];
            })
            .call(setGant)
        gC  .enter()
            .append("rect")
            .attr("class", "gant")
            .call(setGant)
            .on('mouseover', function(d,i) {
                gantInfo = d;
            })
            .on('mouseout', function(d,i) {
                gantInfo = false;
                clearInfo();
            });
        gC  .exit().remove();
    }

    function plotLegend() {
        if (hideLegend) return;
        var text = [];
        for (var index in items) text.push(items[index].name + ':' + items[index].key);
        var lE = legend.selectAll(".legendtext").data(text, function(o,i) {
                return i;
            })
            .attr("x", function() {
                return margin.left + width - 8;
            })
            .attr("y", function(d,i) {
                return margin.top + 20 + 20*i;
            });
        lE  .enter()
            .append("text")
            .style("text-anchor", "end")
            .style("fill", function(d,i) {
                return colors[i];
            })
            .attr("class", "legendtext")
            .attr("x", function() {
                return margin.left + width - 8;
            })
            .attr("y", function(d,i) {
                return margin.top + 20 + 20*i;
            })
            .text(function(d) {
                return d;
            });
        lE.exit().remove();
        var b = { 'x': 0, 'y': 0, 'width': 0, 'height': 0 };
        lE.each(function() {
            var bb = this.getBBox();
            if (b.x == 0) {
                b.x = bb.x;
                b.y = bb.y;
                b.height = bb.height;
            } else {
                b.height = b.height + 20;
            }
            if (bb.x < b.x) b.x = bb.x;
            if (b.width < bb.width) b.width = bb.width;
        });
        legendBox
            .attr("x", b.x - 2)
            .attr("y", b.y - 2)
            .attr("width", b.width+4)
            .attr("height", b.height+4);
    }

    // replot tooltip
    function plotInfo() {
        if (zooming) return;
        if (this.style === undefined) return; // hack: if this is not the svg: skip
        mx = d3.mouse(this)[0];
        my = d3.mouse(this)[1];
        mv = Math.round(+x.invert(mx)/1000);
        var selected = [];
        var textGenerator;
        if (mouseLocksOnNearest) {
            visibleValues.forEach(function(v, i) { // TODO: this is still insane for much data
                selected[i] = [Number.POSITIVE_INFINITY];
                v.map(function(o) {
                    return [ Math.abs(+x(o[0]*1000)-mx) + Math.abs(+y(o[1])-my), o[0], o[1], i ];
                }).forEach(function(o) {
                    if (o[0] < selected[i][0]) selected[i] = o;
                });
                selected[i] = [ selected[i][1], selected[i][2] ];
            });
        } else {
            visibleValues.forEach(function(v, i) {
                var index = getIndex(v, mv);
                index = index[2];
                selected[i] = [ v[index][0], v[index][1] ];
            });
        }
        var infoCircle = svg.select(".info").selectAll("circle")
            .data(selected, function(s,i) { return i; })
            .attr("cx", function(s) { return x(s[0]*1000); })
            .attr("cy", function(s) { return y(s[1]); });
        infoCircle.enter()
            .insert("circle")
            .attr("r", 5)
            .attr("cx", function(s) { return x(s[0]*1000); })
            .attr("cy", function(s) { return y(s[1]); })
            .style("fill", function(s,i) { return colors[i]; });
        var infoLine = svg.select(".info").selectAll("line")
            .data(selected, function(s,i) { return i; })
            .attr("x1", function(s,i) { return x(s[0]*1000); })
            .attr("x2", function(s,i) { return x(s[0]*1000); })
        infoLine.enter()
            .insert("line")
            .attr("x1", function(s,i) { return x(s[0]*1000); })
            .attr("y1", margin.top)
            .attr("x2", function(s,i) { return x(s[0]*1000); })
            .attr("y2", height-margin.top);
        // define text callback for numeric diagram and gant
        // TODO: if you have both types mixed this won't work
        if (gantInfo) {
            selected.push(gantInfo);
            textGenerator = function(s,i) {
                var date = new Date(s[0]*1000);
                return s[2]  + ': ' + date + '(' + Math.ceil((s[1]-s[0])/60) + 'min)';
            }
        } else {
            textGenerator = function(s,i) {
                var date = new Date(Math.round(s[0]/60)*60000);
                return format(date) + ', ' + s[1];
            }
        }
        var infoText = svg.select(".info").selectAll("text")
            .data(selected, function(s,i) { return i; })
            .attr("x", mx+14)
            .attr("y", function(s,i) { return my+24 + 12*i; })
            .text(textGenerator);
        infoText.enter()
            .insert("text")
            .attr("x", mx+14)
            .attr("y", function(s,i) { return my+24 + 12*i; })
            .style("fill", function(s,i) { return colors[i]; })
            .text(textGenerator);
        var b = { 'x': 0, 'y': 0, 'width': 0, 'height': 0 };
        infoText.each(function() {
            var bb = this.getBBox();
            if (b.x == 0) {
                b.x = bb.x;
                b.y = bb.y;
                b.height = bb.height;
            } else {
                b.height = b.height + 12;
            }
            if (b.width < bb.width) b.width = bb.width;
        });
        infoBox.attr('x', b.x).attr('y', b.y)
               .attr('width', b.width).attr('height', b.height)
               .style('display', 'block');
    }

    function clearInfo() {
        svg.select(".info").selectAll("circle").remove();
        svg.select(".info").selectAll("text").remove();
        svg.select(".info").selectAll("line").remove();
        svg.select(".info").selectAll("rect").style('display', 'none');
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
        if (scales[0].values[0] !== undefined) {
            plotPath();
            plotGant();
            plotLegend(); // TODO: plot only once
            plotInfo();
        }
    }

    // rearrange xaxis during dragging (panning done here)
    function dragged(d) {
        var move = +x.invert(d3.event.x) - x.invert(d3.event.x - d3.event.dx);
        xRange = [
            new Date(+xRange[0] - move),
            new Date(+xRange[1] - move)
        ];
        zooming = true;
        plotAxis();
        zooming = false;
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
        zooming = true;
        plotSVG();
        zooming = false;
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
        req(method, params, successMethod, errorMethod);
        setTimeout(startRequests, refresh);
    }

    function errorMethod() {
        console.log('itemGauge request failed');
        d3.select (bindToId).selectAll ("div.alert").style ('opacity', '0.5');
    }

    function successMethod(response, status) {
        var result = response.result[0];
        gauge.redraw(result.lastvalue);
        refresh = result.delay == 0 ? refresh : 1000 * result.delay;
    }

    var gauge = new Gauge(bindToId, config);
    gauge.render();
}
