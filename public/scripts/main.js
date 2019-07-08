$(document).ready(function() {
  var $window = $(window);
  var $document = $(document);
  var $html = $("html");

  $("pre").html(function(index, html) {
    return html
      .split(/\r?\n/)
      .map(function(line) {
        return [
          '<div class="line">',
          '<div class="line-number"><!-- placeholder --></div>',
          '<span class="line-content">' + line + "</span></span>",
          "</div>"
        ].join("");
      })
      .join("");
  });

  // make TOC sticky
  var $toc = $(".g-left-panel");
  if ($toc.length) {
    var stickyTop = $toc.offset().top - 100;
    $window.on("scroll", function() {
      $window.scrollTop() >= stickyTop
        ? $toc.addClass("d-fixed")
        : $toc.removeClass("d-fixed");
    });
  }

  $window.on("hashchange", correctHashScroll);
  correctHashScroll();

  function correctHashScroll() {
    var currentScroll = $document.scrollTop();
    var mastheadHeight = $("#masthead").outerHeight() + 15; // extra padding
    if (window.location.hash && currentScroll > mastheadHeight) {
      console.log("reducing scroll from " + currentScroll);
      $document.scrollTop(currentScroll - mastheadHeight);
    }
  }

  function populateUserHistoryData() {
    $.ajax({
      method: "GET",
      url: "/reading-history/docs.json",
      data: {
        limit: 4
      },
      json: true
    }).always(function(data) {
      var recentlyViewed = data.recentlyViewed;
      var mostViewed = data.mostViewed;

      addElements(recentlyViewed, {
        name: "Recently Viewed",
        emptyText: "You've viewed no stories!"
      });

      addElements(mostViewed, {
        name: "Most Viewed"
      });

      $("#me .popup .fa-spinner").remove();
    });
  }

  $html.one("mouseenter", ".user-tools", populateUserHistoryData);

  function addElements(data, elementAttributes) {
    var $target = $("#me .popup");

    if (!data || data.length == 0) {
      if (elementAttributes.emptyText) {
        $target.append("<p>" + elementAttributes.emptyText + "</p>");
      }
      return;
    }

    var items = data.map(function(el) {
      var item = el.doc;
      var folder = (item.folder || {}).prettyName || ""; // lets not try to show a folder if there isn't one
      var path = item.path ? item.path : "#";
      return [
        "<li>",
        '<a href="' + path + '">',
        '<p class="docs-title">' + item.prettyName + "</p>",
        '<p class="docs-attr">',
        '<span class="docs-folder">' + folder + "</span>",
        '<span class="timestamp">(' + el.lastViewed + ")</span>",
        "</p>",
        "</a>",
        "</li>"
        // use .join() to turn to html string
      ].join("");
    });

    var className =
      elementAttributes.name.toLowerCase().replace(" ", "-") + "-content";

    var fullSection = [
      "<h3>" + elementAttributes.name + "</h3>",
      "<ul class='" + className + "'>" + items.join("") + "</ul>"
    ].join("");

    // perform all the DOM manipulation as a single operation
    $target.append(fullSection);
  }
});

function personalizeHomepage(userId) {}

function fetchHistory(type, userId, cb) {
  var key = "libraryHistory:" + userId + ":" + type;
  var data;

  if ((data = localStorage.getItem(key))) {
    data = JSON.parse(data);

    // refresh localStorage data in the background if it's older than an hour
    if (!data.ts || new Date(data.ts) < new Date() - 60 * 60 * 1000) {
      refreshHistory(key, type);
    }

    return cb(data.history);
  } else {
    return refreshHistory(key, type, cb);
  }
}

function refreshHistory(localStorageKey, type, cb) {
  $.ajax("/reading-history/" + type + ".json?limit=5", {
    success: function(data) {
      localStorage.setItem(
        localStorageKey,
        JSON.stringify({ ts: new Date(), history: data })
      );
      if (cb) {
        return cb(data);
      }
    }
  });
}
