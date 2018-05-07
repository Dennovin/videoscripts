jQuery.Color.fn.contrastColor = function() {
    var r = this._rgba[0], g = this._rgba[1], b = this._rgba[2];
    return (((r*299)+(g*587)+(b*144))/1000) >= 131.5 ? "black" : "white";
};

var videoweb = function() {
    var player, allPlayers;
    var currentvideo = null, currentclip = {"cameraswaps": []};
    var storage = window.localStorage;
    var videofiles = {};
    var timerEvents = [];
    var goals = [];
    var clips = [];
    var timerNames = ["1st", "2nd"];
    var timerLength = 24*60;
    var zoomX, zoomY;
    var colorList = ["#222", "#999", "#ddd", "#900", "#d50", "#dd0", "#090", "#040", "#5dd", "#00d", "#009", "#90d", "#d49"];
    var flipped = false;

    $(document).ready(function() {
        // Bind events
        $(".game-info").on("click", ".color", openColorSelector);
        $(".row").on("click", ".color-selection", selectColor);
        $(".files-loaded").on("click", ".row", selectVideoFile);
        $(".timer-events").on("click", ".selectable.row.goal", selectGoal);
        $(".timer-events").on("click", ".selectable.row.goal .delete", deleteGoal);
        $(".timer-events").on("click", ".selectable.row.timer", selectTimer);
        $(".timer-events").on("click", ".selectable.row.timer .delete", deleteTimer);
        $(".video-clips").on("click", ".selectable.row", selectClip);
        $(".video-clips").on("click", ".selectable.row .delete", deleteClip);
        $(".editbox.goal").on("change", "input, select", editGoal);
        $(".editbox.timer").on("change", "input, select", editTimer);
        $(".editbox.clip").on("change", "input, select", editClip);
        $(".box.game-info").on("change", "input, select", updateData);
        $(".boxes").on("click", ".title", toggleBox);
        $("body").click(removePopups);
        $("body").on("click", ".video-object.zooming video, #zoom-box", zoomClick);
        $("body").on("mousemove", ".video-object.zooming, #zoom-box", zoomMove);
        window.setInterval(setTimer, 10);

        // Set up and resize player
        allPlayers = [
            videojs("video-object-1"),
            videojs("video-object-2")
        ];

        player = allPlayers[0];
        resizePlayer();
        $(window).resize(resizePlayer);

        // Watch for files being dragged/dropped
        setupFileReader();

        // Set up color boxes
        $("input.color").change(function(e) {
            setTextColor($(this));
        });

        // Set up datepickers
        $("input.datepicker").datepicker({dateFormat: "yy-mm-dd"});

        // Initialize download links
        updateData();
    });

    function toggleBox(e) {
        $(this).closest(".box").toggleClass("collapsed");
        e.preventDefault();
        e.stopPropagation();
    }

    function removePopups(e) {
        $(".color-selector").remove();
    }

    function formatTime(seconds) {
        var minutes = parseInt(seconds / 60);
        seconds = seconds % 60;

        var str = (minutes < 10 ? "0" : "") + minutes + ":";
        str += (seconds < 10 ? "0" : "") + parseInt(seconds) + ".";

        var cs = parseInt((seconds - parseInt(seconds)) * 100);
        str += (cs < 10 ? "0" : "") + cs;

        return str;
    }

    function getAbsoluteTime(time, videoIdx) {
        time = time || player.currentTime();

        var activeSection = $(".files-loaded .selected").closest(".files-loaded");
        activeSection.find(".selectable").each(function(i) {
            if(videoIdx == i || (videoIdx === undefined && $(this).hasClass("selected"))) {
                return false;
            }

            if(videofiles[$(this).attr("videourl")].duration !== undefined) {
                time += videofiles[$(this).attr("videourl")].duration;
            }
        });

        return time;
    }

    function currentGameTime() {
        var clipStart = 0;
        var lastTimerStart = 0;
        var timerPausedFor = 0;
        var pauseStarted = 0;

        var now = getAbsoluteTime();

        timerEvents.sort(function(a, b) { return a.time - b.time; });

        for(i in timerEvents) {
            var evt = timerEvents[i];
            if(evt.time > now) {
                break;
            }

            if(evt.event == "start" && evt.time > lastTimerStart) {
                lastTimerStart = evt.time;
                timerPausedFor = 0;
            }
            if(evt.event == "pause") {
                pauseStarted = evt.time;
            }
            if(evt.event == "unpause") {
                timerPausedFor += evt.time - pauseStarted;
                pauseStarted = 0;
            }
        }

        if(lastTimerStart == 0) {
            return 0;
        }

        var timeLeft = timerLength - (now - lastTimerStart) + timerPausedFor;
        if(pauseStarted > 0) {
            timeLeft += now - pauseStarted;
        }

        return Math.max(timeLeft, 0);
    }

    function currentPeriod() {
        var now = getAbsoluteTime();
        var lastTimerStart = 0;
        var currentPd = "";

        timerEvents.sort(function(a, b) { return a.time - b.time; });

        for(i in timerEvents) {
            var evt = timerEvents[i];
            if(evt.time > now) {
                break;
            }

            if(evt.event == "start" && evt.time > lastTimerStart) {
                lastTimerStart = evt.time;
                currentPd = evt.timer;
            }
        }

        return currentPd;
    }

    function currentScore() {
        var scores = {};
        var now = getAbsoluteTime();

        goals.sort(function(a, b) { return a.time - b.time; });
        for(i in goals) {
            var evt = goals[i];
            var team = evt.team.toLowerCase();
            if(evt.time > now) {
                break;
            }

            scores[team] = (scores[team] || 0) + 1;
        }

        return scores;
    }

    function setTimer() {
        var timeLeft = currentGameTime();
        var score = currentScore();
        $("#abs-timer-box").html(formatTime(getAbsoluteTime()).substr(0, 8));
        $("#timer-box").html(currentPeriod() + " " + formatTime(timeLeft).substr(0, 5));
        $("#away-score-box").html(score["away"] || 0);
        $("#home-score-box").html(score["home"] || 0);
        $("#scoreboard-container").css({"left": $(".video-object-active").width() - $("#scoreboard-container").width()});
    }

    function formatLoc(x, y) {
        return "(" + Math.floor(x) + ", " + Math.floor(y) + ")";
    }

    function parseTime(timestr) {
        return timestr.split(":").reverse()
            .map(function(v, i) { return parseFloat(v) * Math.pow(60, i); })
            .reduce(function(p, c) { return p + c; });
    }

    function updateGameLink() {
        data = 'home_team:\n' +
            '  name: ' + $("input[name=home-team]").val() + '\n' +
            ($("input[name=home-team-color]").val() == "" ? "" : '  color: "' + $("input[name=home-team-color]").val() + '"\n') +
            '\n' +
            'away_team:\n' +
            '  name: ' + $("input[name=away-team]").val() + '\n' +
            ($("input[name=away-team-color]").val() == "" ? "" : '  color: "' + $("input[name=away-team-color]").val() + '"\n') +
            '\n' +
            'game_date: ' + $("input[name=game-date]").val() + '\n' +
            '\n';

        data += 'goals:\n';
        for(i in goals) {
            var goal = goals[i];
            data += '  - { team: "' + goal.team + '", time: "' + formatTime(goal.time) + '" }\n';
        }
        data += '\n';

        data += 'timer_events:\n';
        for(i in timerEvents) {
            var event = timerEvents[i];
            data += '  - { timer: ' + event.timer + ', event: ' + event.event + ', time: "' + formatTime(event.time) + '" }\n';
        }
        data += '\n';

        var blob = new Blob([data], { type: "text/x-yaml" });
        $(".game-link").attr("href", window.URL.createObjectURL(blob));
    }

    function updateClipsLink() {
        data = 'include:\n' +
            ' - defaults.yaml\n' +
            ' - game.yaml\n' +
            ' - youtube.yaml\n' +
            '\n';

        if(flipped) {
            data += 'flip: true\n';
        }

        data += "cameras:\n";
        $(".files-loaded").each(function(i) {
            data += '  - name: ' + (i+1) + '\n';
            data += '    files:\n';
            $(this).find(".selectable").each(function() {
                data += '      - "' + $(this).text() + '"\n';
            });

            data += '\n';
        });

        data += "clips:\n";
        for(i in clips) {
            clip = clips[i];
            data += '  - { start: "' + formatTime(clip.start) + '", end: "' + formatTime(clip.end) + '", camera: ';
            if(clip.cameraswaps.length > 0) {
                data += '[ { time: "' + formatTime(clip.start) + '", camera: ' + clip.camera + ' }, ';

                swaptext = [];
                currentCamera = clip.camera;
                for(j in clip.cameraswaps) {
                    currentCamera = (currentCamera % $(".files-loaded").length) + 1;
                    swaptext.push('{ time: "' + formatTime(clip.cameraswaps[j]) + '", camera: ' + currentCamera + ' }');
                }

                data += swaptext.join(", ");
                data += ']';
            } else {
                data += clip.camera;
            }

            if(clip.zoom) {
                data += ', pre_effects: [["crop", ' + clip.zoom.x1 + ', ' + clip.zoom.y1 + ', ' + clip.zoom.x2 + ', ' + clip.zoom.y2
                        + '], ["resize", {"width": ' + player.videoWidth() + ', "height": ' + player.videoHeight() + '}]]';
                }
            }

            data += ' }\n';
        }

        var blob = new Blob([data], { type: "text/x-yaml" });
        $(".clips-link").attr("href", window.URL.createObjectURL(blob));
    }

    function getLocalStorageKey() {
        var filenames = [];
        for(i in videofiles) {
            filenames.push(videofiles[i].filename);
        }
        filenames.sort()

        return filenames.join(",");
    }

    function updateLocalStorage() {
        storageData = {
            "timerEvents": timerEvents,
            "goals": goals,
            "clips": clips,
            "homeTeam": $("input[name=home-team]").val(),
            "homeTeamColor": $("input[name=home-team-color]").val(),
            "awayTeam": $("input[name=away-team]").val(),
            "awayTeamColor": $("input[name=away-team-color]").val(),
            "gameDate": $("input[name=game-date]").val()
        };

        storage.setItem(getLocalStorageKey(), JSON.stringify(storageData));
    }

    function updateData() {
        updateGameLink();
        updateClipsLink();
        updateLocalStorage();
    }

    function resizePlayer() {
        var newWidth, newHeight;

        newWidth = Math.min($(window).width() - 500, 1920);
        newHeight = Math.floor(newWidth * 9 / 16);

        $(".video-object")
            .attr("height", newHeight)
            .attr("width", newWidth)
            .css({"height": newHeight, "width": newWidth});

        $(".boxes").css("left", newWidth + 20);
    }

    function updateCurrentClip() {
        if(player.duration()) {
            currentvideo.duration = player.duration();
        }

        $("#clip-camera").val(currentclip.camera);
        $("#clip-camera-swaps").val(currentclip.cameraswaps.map(x => formatTime(x)).join(", "));

        if(currentclip.start) {
            $("#clip-start").val(formatTime(currentclip.start));
        } else {
            $("#clip-start").val("");
        }

        if(currentclip.end) {
            $("#clip-end").val(formatTime(currentclip.end));
        } else {
            $("#clip-end").val("");
        }

        if(currentclip.zoom) {
            $("#clip-zoom").val(formatLoc(currentclip.zoom.x1, currentclip.zoom.y1) + " - " + formatLoc(currentclip.zoom.x2, currentclip.zoom.y2));
        } else {
            $("#clip-zoom").val("");
        }
    }

    function updateVideoFiles() {
        $(".files-loaded .inputs").not(".editbox .inputs").empty();

        var container1 = $(".files-loaded.camera1 .inputs").not(".editbox .inputs");
        var container2 = $(".files-loaded.camera2 .inputs").not(".editbox .inputs");

        $.each(videofiles, function(i, videofile) {
            var row = $("<div/>").addClass("row selectable").text(videofile.filename).attr("videourl", videofile.url);

            if($(container1).find(".selectable").length == 0 || ($(container1).find(".selectable").first().text().substr(5, 4) == videofile.filename.substr(5, 4))) {
                row.appendTo(container1);
            } else {
                row.appendTo(container2);
            }
        });

        if(currentvideo) {
            container.find(".row[videourl='" + currentvideo.url + "']").addClass("selected");
        }
    }

    function updateGameEvents() {
        var events = [];
        var container = $(".timer-events .inputs").not(".editbox .inputs");

        timerEvents.sort(function(a, b) { return a.time - b.time; });
        $.each(timerEvents, function(i, event) {
            var event = {"idx": i, "time": event.time, "type": "timer", "title": (event.event.substring(0, 1).toUpperCase() + event.event.slice(1)) + " " + event.timer};
            events.push(event);
        });

        goals.sort(function(a, b) { return a.time - b.time; });
        $.each(goals, function(i, goal) {
            var event = {"idx": i, "time": goal.time, "type": "goal", "title": "Goal (" + (goal.team.substring(0, 1).toUpperCase() + goal.team.slice(1)) + ")"};
            events.push(event);
        });

        events.sort(function(a, b) { return a.time - b.time; });

        $.each(events, function(i, event) {
            var row = container.find("." + event.type + "[idx=" + event.idx + "]");
            if(row.length == 0) {
                row = $("<div/>").addClass("row selectable").addClass(event.type).attr("idx", event.idx).appendTo(container);
            }

            var infocells = [
                $("<div/>").addClass("infocell").text(formatTime(event.time)),
                $("<div/>").addClass("infocell").text(event.title),
                $("<img/>").addClass("delete").attr("src", "delete.png")
            ];

            row.empty().append(infocells);
        });
    }

    function forceUpdateGameEvents() {
        $(".editbox").detach().hide().appendTo("body");
        $(".timer-events .inputs").empty();
        updateGameEvents();
    }

    function updateClipList() {
        var container = $(".video-clips .inputs").not(".editbox .inputs");

        clips.sort(function(a, b) { return a.start - b.start; });
        $.each(clips, function(i, clip) {
            clip.idx = i;

            var row = container.find(".row[idx=" + clip.idx + "]");
            if(row.length == 0) {
                row = $("<div/>").addClass("row selectable").attr("idx", clip.idx).appendTo(container);
            }

            var infocells = [
                $("<div/>").addClass("infocell").text(formatTime(clip.start)),
                $("<div/>").addClass("infocell").text(formatTime(clip.end)),
                $("<img/>").addClass("delete").attr("src", "delete.png")
            ];

            row.empty().attr("start", clip.start).append(infocells);
        });
    }

    function forceUpdateClipList() {
        $(".editbox").detach().hide().appendTo("body");
        $(".video-clips .inputs").empty();
        updateClipList();
    }

    function openColorSelector(e) {
        e.stopPropagation();

        var $this = $(this);
        var $row = $this.closest(".row");
        var $selector = $(".color-selector").detach();
        if($selector.length == 0) {
            $selector = $("<div/>").addClass("color-selector");

            for(i in colorList) {
                $("<div/>").addClass("color-selection")
                    .attr("background", colorList[i])
                    .css("background", colorList[i])
                    .appendTo($selector)
            }
        }

        $selector.css("top", $this.position().top + $this.height() + 8);
        $selector.find(".color-selection.selected").removeClass("selected");
        if($this.val()) {
            $selector.find(".color-selection[background=" + $this.val() + "]").addClass("selected");
        }

        $selector.appendTo($row);
    }

    function selectColor(e) {
        var $this = $(this);
        var $row = $this.closest(".row");
        var $selector = $this.closest(".color-selector");
        var $input = $row.find("input.color");

        e.stopPropagation();

        var color = $this.attr("background");
        $input.val(color).css({"background": color});
        setTextColor($input);
        $selector.remove();

        var $scoreBox = $input.attr("name") == "away-team-color" ? $("#away-score-box") : $("#home-score-box");
        var rgbcolor = $input.css("background-color");
        var rgba = "rgba(" + rgbcolor.substring(4, rgbcolor.length - 1) + ", 0.5)";
        $scoreBox.css("background-color", rgba);
    }

    function setTextColor(input) {
        input.css("background-color", input.val());
        var textColor = $.Color(input.css("background-color")).contrastColor();
        input.css("color", textColor);
    }

    function selectVideoFile() {
        var $this = $(this);

        var idx = $this.closest(".files-loaded .inputs").find(".selectable").index($this);
        for(i in allPlayers) {
            var url = $($($(".files-loaded .inputs").get(i)).find(".selectable").get(idx)).attr("videourl");
            $("video").get(i).src = url;
        }

        $(".files-loaded .inputs").find(".selectable").removeClass("selected");
        $this.addClass("selected");

        currentvideo = videofiles[$this.attr("videourl")];

        forceUpdateGameEvents();
        forceUpdateClipList();
    }

    function selectGoal() {
        var $this = $(this);

        var isSelected = $this.hasClass("selected");
        var editbox = $(".editbox.goal");
        var goal = goals[$this.attr("idx")];

        editbox.hide();
        $this.closest(".inputs").find(".selectable").removeClass("selected");

        if(!isSelected) {
            $this.addClass("selected");

            var offset = $this.offset();
            editbox.find("input[name=goal-time]").val(formatTime(goal.time));
            editbox.find("select[name=goal-team]").val(goal.team);
            editbox.detach().insertAfter($this).show();
        }
    }

    function deleteGoal(e) {
        var $this = $(this);
        var row = $this.closest(".row.goal");

        e.stopPropagation();

        goals.splice(row.attr("idx"), 1);
        forceUpdateGameEvents();
        updateData();
    }

    function deleteTimer(e) {
        var $this = $(this);
        var row = $this.closest(".row.timer");

        e.stopPropagation();

        timerEvents.splice(row.attr("idx"), 1);
        forceUpdateGameEvents();
        updateData();
    }

    function deleteClip(e) {
        var $this = $(this);
        var row = $this.closest(".row");

        e.stopPropagation();

        clips.splice(row.attr("idx"), 1);
        forceUpdateClipList();
        updateData();
    }

    function editGoal() {
        var selected = $(".timer-events .row.goal.selected");
        var goal = goals[selected.attr("idx")];

        $(".editbox.goal").find(".error").removeClass("error");

        try {
            goal.time = parseTime($(".editbox.goal input[name=goal-time]").val());
        }
        catch(err) {
            $(".editbox.goal input[name=goal-time]").addClass("error");
        }

        goal.team = $(".editbox.goal select[name=goal-team]").val();

        updateGameEvents();
        updateData();
    }

    function selectTimer() {
        var $this = $(this);

        var isSelected = $this.hasClass("selected");
        var editbox = $(".editbox.timer");
        var event = timerEvents[$this.attr("idx")];

        editbox.hide();
        $this.closest(".inputs").find(".selectable").removeClass("selected");

        if(!isSelected) {
            $this.addClass("selected");

            var offset = $this.offset();
            editbox.find("input[name=timer-time]").val(formatTime(event.time));
            editbox.find("input[name=timer-name]").val(event.timer);
            editbox.find("select[name=timer-event]").val(event.event);
            editbox.detach().insertAfter($this).show();
        }
    }

    function editTimer() {
        var selected = $(".timer-events .row.timer.selected");
        var event = timerEvents[selected.attr("idx")];

        $(".editbox.timer").find(".error").removeClass("error");

        try {
            event.time = parseTime($(".editbox.timer input[name=timer-time]").val());
        }
        catch(err) {
            $(".editbox.timer input[name=timer-time]").addClass("error");
        }

        event.timer = $(".editbox.timer input[name=timer-name]").val();
        event.event = $(".editbox.timer select[name=timer-event]").val();

        updateGameEvents();
        updateData();
    }

    function selectClip() {
        var $this = $(this);

        var isSelected = $this.hasClass("selected");
        var editbox = $(".editbox.clip");
        var clip = clips[$this.attr("idx")];

        editbox.hide();
        $this.closest(".inputs").find(".selectable").removeClass("selected");

        if(!isSelected) {
            $this.addClass("selected");

            var offset = $this.offset();
            editbox.find("input[name=clip-start-time]").val(formatTime(clip.start));
            editbox.find("input[name=clip-end-time]").val(formatTime(clip.end));
            editbox.detach().insertAfter($this).show();
        }
    }

    function editClip() {
        var selected = $(".video-clips .row.selected");
        var clip = clips[selected.attr("idx")];

        $(".editbox.clip").find(".error").removeClass("error");

        try {
            clip.start = parseTime($(".editbox.clip input[name=clip-start-time]").val());
        }
        catch(err) {
            $(".editbox.clip input[name=clip-start-time]").addClass("error");
        }

        try {
            clip.end = parseTime($(".editbox.clip input[name=clip-end-time]").val());
        }
        catch(err) {
            $(".editbox.clip input[name=clip-end-time]").addClass("error");
        }

        updateClipList();
        updateData();
    }

    function saveCurrentClip() {
        if(currentclip.start && currentclip.end) {
            clips.push(currentclip);
            currentclip = {"cameraswaps": []};
            updateClipList();
            updateCurrentClip();
            updateData();
        }
    }

    function addTimerEvent(eventtime) {
        var timerNameIndex = 0;
        var timerEvent = "start";

        if(timerEvents.length > 0) {
            var lastEvent = timerEvents[timerEvents.length - 1];
            timerNameIndex = timerNames.indexOf(lastEvent.timer);

            if(timerNameIndex < timerNames.length - 1 && lastEvent.event == "end") {
                timerNameIndex++;
            } else if(lastEvent.event == "start" || lastEvent.event == "unpause") {
                timerEvent = "end";
            } else if(lastEvent.event == "pause") {
                timerEvent = "unpause";
            }
        }

        var event = {"timer": timerNames[timerNameIndex], "event": timerEvent, "time": eventtime};
        timerEvents.push(event);
        updateGameEvents();
        updateData();
    }

    function addGoal(eventtime) {
        var event = {"team": "away", "time": eventtime};
        goals.push(event);
        updateGameEvents();
        updateData();
    }

    function divDrop(e) {
        e.preventDefault();

        e.dropEffect = "link";

        var reader = new FileReader();
        $.each(e.originalEvent.dataTransfer.files, function(i, file) {
            var videourl = window.URL.createObjectURL(file);
            var videofile = {"filename": file.name, "url": videourl};
            videofiles[videourl] = videofile;
        });

        updateVideoFiles();

        if(!currentvideo) {
            $(".files-loaded .inputs .row").first().click();
        }

        if(getLocalStorageKey() in storage) {
            storageData = JSON.parse(storage.getItem(getLocalStorageKey()));

            timerEvents = storageData.timerEvents;
            goals = storageData.goals;
            clips = storageData.clips;
            $("input[name=home-team]").val(storageData.homeTeam);
            $("input[name=home-team-color]").val(storageData.homeTeamColor);
            $("input[name=away-team]").val(storageData.awayTeam);
            $("input[name=away-team-color]").val(storageData.awayTeamColor);
            $("input[name=game-date]").val(storageData.gameDate);

            setTextColor($("input[name=home-team-color]"));
            setTextColor($("input[name=away-team-color]"));

            forceUpdateGameEvents();
            forceUpdateClipList();
        }
    }

    function getZoomValues() {
    }

    function zoomClick(e) {
        e.stopPropagation();
        e.preventDefault();

        if($("#zoom-box").hasClass("active")) {
            var $videoObj = $(".video-object-active"), $zoomBox = $("#zoom-box");
            var x1 = $zoomBox.offset().left - $videoObj.offset().left, y1 = $zoomBox.offset().top - $videoObj.offset().top;
            var x2 = x1 + $zoomBox.width(), y2 = y1 + $zoomBox.height();

            x1 = Math.floor(x1 / $videoObj.width() * player.videoWidth() / 16) * 16;
            x2 = Math.floor(x2 / $videoObj.width() * player.videoWidth() / 16) * 16;
            y1 = Math.floor(y1 / $videoObj.height() * player.videoHeight() / 9) * 9;
            y2 = y1 + (x2 - x1) * (9/16);

            currentclip.zoom = {"x1": x1, "x2": x2, "y1": y1, "y2": y2};
            updateCurrentClip();

            $(".video-object").removeClass("zooming");
        } else {
            zoomX = e.pageX;
            zoomY = e.pageY;

            $("#zoom-box").css({
                "left": e.pageX,
                "top": e.pageY,
                "width": 0,
                "height": 0
            });
        }

        $("#zoom-box").toggleClass("active");
    }

    function zoomMove(e) {
        if($("#zoom-box").hasClass("active")) {
            var $videoObj = $(".video-object-active");
            var vminX = $videoObj.offset().left, vminY = $videoObj.offset().top;
            var vmaxX = vminX + $videoObj.width(), vmaxY = vminY + $videoObj.height();
            var evtX = Math.min(vmaxX, Math.max(vminX, e.pageX));
            var evtY = Math.min(vmaxY, Math.max(vminY, e.pageY));
            var aspect = $videoObj.width() / $videoObj.height();
            var boxWidth = Math.abs(zoomX - evtX);
            var boxHeight = Math.abs(zoomY - evtY);

            if(aspect < boxWidth / boxHeight) {
                boxHeight = boxWidth / aspect;
            } else {
                boxWidth = boxHeight * aspect;
            }

            var boxLeft = (evtX < zoomX) ? Math.max(vminX, zoomX - boxWidth) : Math.min(vmaxX - boxWidth, zoomX);
            var boxTop = (evtY < zoomY) ? Math.max(vminY, zoomY - boxHeight) : Math.min(vmaxY - boxHeight, zoomY);

            $("#zoom-box").css({
                "left": boxLeft - 2,
                "top": boxTop - 2,
                "width": boxWidth - 4,
                "height": boxHeight - 4
            });
        }
    }

    function toggleZoom(e) {
        e.stopPropagation();
        e.preventDefault();

        $(".video-object").toggleClass("zooming");
    }

    function activePlayerIdx() {
        for(i in allPlayers) {
            if(allPlayers[i] == player) {
                return parseInt(i);
            }
        }
    }

    function changeCamera() {
        wasFullscreen = player.isFullscreen();
        newIdx = (activePlayerIdx() + 1) % allPlayers.length;
        $(".video-object").removeClass("video-object-active");
        $("#" + allPlayers[newIdx].id_).addClass("video-object-active");

        if(wasFullscreen) {
            player.exitFullscreen();
        }

        player = allPlayers[newIdx];

        if(wasFullscreen) {
            player.requestFullscreen();
        }

        for(i in allPlayers) {
            allPlayers[i].muted(true);
        }

        player.muted(false);
    }

    function setTime(time) {
        for(i in allPlayers) {
            allPlayers[i].currentTime(time);
        }
    }

    function timeToMove(e) {
        if(e.ctrlKey) {
            return 30;
        }

        if(e.shiftKey) {
            return 1;
        }

        return 5;
    }

    function readKey(e) {
        switch(e.which) {
        case 73:  // I
            currentclip.start = getAbsoluteTime();
            currentclip.camera = activePlayerIdx() + 1;
            currentclip.cameraswaps = [];
            updateCurrentClip();
            break;

        case 79:  // O
            currentclip.end = getAbsoluteTime();
            updateCurrentClip();
            break;

        case 65:  // A
            saveCurrentClip();
            break;

        case 67:  // C
            changeCamera();
            break;

        case 70:  // F
            if(player.isFullscreen()) {
                player.exitFullscreen();
            } else {
                player.requestFullscreen();
            }

            break;

        case 71:  // G
            addGoal(getAbsoluteTime());
            break;

        case 82:  // R
            for(i in allPlayers) {
                allPlayers[i].zoomrotate({"rotate": 180});
            }

            flipped = !flipped;
            break;

        case 84:  // T
            addTimerEvent(getAbsoluteTime());
            break;

        case 90:  // Z
            toggleZoom(e);
            break;

        case 83:  // S
            if(currentclip.start) {
                currentclip.cameraswaps.push(getAbsoluteTime());
                updateCurrentClip();
            }

            break;

        case 190: // >
            for(i in allPlayers) {
                allPlayers[i].playbackRate(allPlayers[i].playbackRate() * 1.5);
            }

            break;

        case 188: // <
            for(i in allPlayers) {
                allPlayers[i].playbackRate(allPlayers[i].playbackRate() / 1.5);
            }

            break;

        case 219: // [
            if(currentclip && currentclip.start) {
                currentclip.start -= 1;
                $("#clip-start").val(formatTime(currentclip.start));
            }

            break;

        case 221: // ]
            if(currentclip && currentclip.start) {
                currentclip.start += 1;
                $("#clip-start").val(formatTime(currentclip.start));
            }

            break;

        case 191:  // /
            for(i in allPlayers) {
                allPlayers[i].playbackRate(1.0);
            }

            break;

        case 32:  // space
            var paused = player.paused();
            for(i in allPlayers) {
                paused ? allPlayers[i].play() : allPlayers[i].pause();
            }

            break;

        case 39:  // right
            setTime(player.currentTime() + timeToMove(e));
            break;

        case 37:  // left
            setTime(player.currentTime() - timeToMove(e));
            break;
        }
    }

    function setupFileReader() {
        $(document)
            .bind("dragover", function(e) { e.preventDefault(); })
            .bind("dragenter", function(e) { e.preventDefault(); })
            .bind("drop", divDrop);

        $("input").keydown(function(e) { e.stopPropagation(); });
        $("html").keydown(readKey);
    }
}();
