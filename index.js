function app(jsonurl){

var width = 700,
    height = 700,
    radius = Math.min(width, height) / 2;

var x = d3.scale.linear()
    .range([0, 2 * Math.PI]);

var y = d3.scale.linear()
    .range([0, radius]);

var color = d3.scale.category20c();

var svg = d3.select("#d3container").append("svg")
    .attr("width", width)
    .attr("height", height)
  .append("g")
    .attr("transform", "translate(" + width / 2 + "," + (height / 2) + ")");

var minSliceSize = 0.01;

var partition = d3.layout.partition()
    .sort(null)
    .value(function(d) { return d['1999']; });

var arc = d3.svg.arc()
    .startAngle(function(d) { return Math.max(0, Math.min(2 * Math.PI, x(d.x))); })
    .endAngle(function(d) { return Math.max(0, Math.min(2 * Math.PI, x(d.x + d.dx))); })
    .innerRadius(function(d) { return Math.max(0, y(d.y)); })
    .outerRadius(function(d) { return Math.max(0, y(d.y + d.dy)); });


var yearSlider = $('#year').slider({
  tooltip: 'always',
  formatter: function(value) {
    return 'Árið ' + value;
  }
});

var sliceThickness = y(0.25); // in px

var infoHeading = $('#info-heading');
var info = $('#info');

// Keep track of the node that is currently being displayed as the root.
var node;

d3.json(jsonurl, function(error, root) {
  node = root;
  var g = svg.datum(root).selectAll('g')
      .data(partition.nodes)
      .enter().append('g');


  var path = g.append("path")
      .attr("d", arc)
      .style("fill", function(d) { return color((d.children ? d : d.parent).name); })
      .on('dblclick', function (d) { console.log(d); })
      .on("click", click)
      // .on('mouseover', updateBarChart)
      .each(stash);

  var text = g.append("text")
    .attr("transform", textTransform)
    .attr("dx", "6") // margin
    .attr("dy", ".35em") // vertical-align
    .attr('display', function(d) { return d.value/node.value < minSliceSize ? 'none' : 'block'; })
    .attr('opacity', function(d) { return d.value/node.value < minSliceSize ? '0' : '1'; })
    .text(function(d) {
      return d.name;
    });

  updateBarChart(node);

  yearSlider.on('change', function(event) {
    var value = event.value.newValue;
    var dataFunction = function(d) { return d[value] }
    g
        .data(partition.value(dataFunction).nodes);
    path
      .transition()
        .duration(1000)
        .attrTween("d", arcTweenData)
        .each("end", transitioner);
    text
      .transition()
        .duration(1000);
    updateBarChart(node);
  });

  function click(d) {
    if (d.depth === 3) {
      // Can't click last arc, e.g. EES, China. 
      d = d.parent;
    }
    node = d;
    text.transition().attr('opacity', 0);
    path.transition()
      .duration(750)
      .attrTween("d", arcTweenZoom(d))
      .each("end", transitioner);

    updateBarChart(node);
  }
});

d3.select(self.frameElement).style("height", height + "px");

function transitioner(e, i) {
  // check if it is large enough to actually display
  if (e.value/node.value < minSliceSize || e.value && e.value <= 0) {
    d3.select(this.parentNode).select("text")
      .attr('display', 'none')
      .transition().attr('opacity', 0)
      
  } else 
  // check if the animated element's data e lies within the visible angle span given in d
  if (e.x >= node.x && e.x < (node.x + node.dx)) {
    // get a selection of the associated text element
    var arcText = d3.select(this.parentNode).select("text");
    // fade in the text element and recalculate positions
    arcText
      .attr('display', 'block')
      .transition().duration(750)
      .attr("opacity", 1)
      .attr("transform", textTransform);
  }
}

// Setup for switching data: stash the old values for transition.
function stash(d) {
  d.x0 = d.x;
  d.dx0 = d.dx;
}

// When switching data: interpolate the arcs in data space.
function arcTweenData(a, i) {
  var oi = d3.interpolate({x: a.x0, dx: a.dx0}, a);
  function tween(t) {
    var b = oi(t);
    a.x0 = b.x;
    a.dx0 = b.dx;
    return arc(b);
  }
  if (i == 0) {
   // If we are on the first arc, adjust the x domain to match the root node
   // at the current zoom level. (We only need to do this once.)
    var xd = d3.interpolate(x.domain(), [node.x, node.x + node.dx]);
    return function(t) {
      x.domain(xd(t));
      return tween(t);
    };
  } else {
    return tween;
  }
}

// When zooming: interpolate the scales.
function arcTweenZoom(d) {
  var xd = d3.interpolate(x.domain(), [d.x, d.x + d.dx]),
      yd = d3.interpolate(y.domain(), [d.y, 1]),
      yr = d3.interpolate(y.range(), [d.y ? 20 : 0, radius]);
  return function(d, i) {
    return i
        ? function(t) { return arc(d); }
        : function(t) { x.domain(xd(t)); y.domain(yd(t)).range(yr(t)); return arc(d); };
  };
}

function textTransform(d) {
  if (d.depth <= node.depth) {
    return 'translate(20)';
  }
  sliceThickness = y(node.y+0.25);
  var xTranslate = y(d.y);
  var c = node.depth === 0 ? 0 : 20; // Minor correction if not in top view
  var rotation = computeTextRotation(d);
  return "rotate(" + rotation + ")translate(" + (rotation > 90 ? xTranslate+sliceThickness-c : xTranslate) + ")rotate(" + (rotation > 90 ? -180 : 0) + ")";
}

function computeTextRotation(d) {
  return (x(d.x + d.dx / 2) - Math.PI / 2) / Math.PI * 180;
}

var highlightedSlices = [];

function updateBarChart(data) {
  if (data.children) {
    infoHeading.html(data.name);
  } else {
    infoHeading.html(data.parent.name)
  }
  var children = data.children || data.parent.children;
  var rows = children
    .slice() // clone array
    .sort(function(a, b) {
      return b.value - a.value;
    })
    .map(function(child) {
      var rowClass = highlightedSlices.indexOf(child.name) === -1 ? '' : 'info';
      return '<tr class="' + rowClass + '">'+ 
        '<th scope="row">'+ child.name +'</th>' + 
        '<td>'+ Math.round(child.value*10)/10 +'</td>' +
        '<td>'+ Math.round(child.value/child.parent.value*100*10)/10 +'</td></tr>';
    }).join('');
  info.empty().append(rows);
  info.children('tr').on('click', function(event) {
    var sliceName = $(this).children().first().text();
    var pathElement = $('#d3container text').filter(function () {
      return $(this).text() === sliceName;
    }).prev();
    if (!!pathElement.attr('class')) {
      highlightedSlices.splice(highlightedSlices.indexOf(sliceName), 1);
      $(this).removeClass('info');
      pathElement.removeAttr('class');
    } else {
      highlightedSlices.push(sliceName);
      $(this).addClass('info');
      pathElement.attr('class', 'highlighted-slice');
    }
  });
}

$('#year-plus').click(function() {
  var currValue = yearSlider.slider('getValue');
  var nextValue = currValue + 1;
  yearSlider.slider('setValue', nextValue, true, true);
});

$('#year-minus').click(function() {
  var currValue = yearSlider.slider('getValue');
  var nextValue = currValue - 1;
  yearSlider.slider('setValue', nextValue, true, true);
});

};

var jsonurls = ["utflutningur_regionfirst.json", "utflutningur_catfirst.json"];

function switchJsonFile(){
  var url = jsonurls.pop();
  jsonurls.unshift(url);
  app(url);
};

switchJsonFile();

$('#heirarchy-button').click(function() {
  $("#d3container").empty();
  switchJsonFile();
});
