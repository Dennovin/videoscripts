jQuery.Color.fn.contrastColor = function() {
    var r = this._rgba[0], g = this._rgba[1], b = this._rgba[2];
    return (((r*299)+(g*587)+(b*144))/1000) >= 131.5 ? "black" : "white";
};

var videoweb = function() {
    var player;
    var currentvideo = null, currentclip = {};
    var storage = window.localStorage;
    var videofiles = [];
    var timerNames = ["1st", "2nd"];
    var timerLength = 24*60;
    var zoomX, zoomY;
    var colorList = ["#222", "#999", "#ddd", "#900", "#d50", "#dd0", "#090", "#040", "#5dd", "#00d", "#009", "#90d", "#d49"];

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
        $("body").on("click", "#video-object.zooming video, #zoom-box", zoomClick);
        $("body").on("mousemove", "#video-object.zooming, #zoom-box", zoomMove);
        window.setInterval(setTimer, 500);

        // Set up and resize player
        player = videojs("video-object");
        resizePlayer();
        $(window).resize(resizePlayer);

        // Watch for files being dragged/dropped
        setupFileReader();

        // Set up color boxes
        $("input.color").change(function(e) {
            $(this).css("background-color", $(this).val());
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
        if(!videoIdx) {
            for(i in videofiles) {
                if(videofiles[i].filename == currentvideo.filename) {
                    videoIdx = i;
                }
            }
        }

        for(var i = 0; i < videoIdx; i++) {
            time += videofiles[i].duration;
        }

        return time;
    }

    function currentGameTime() {
        var clipStart = 0;
        var lastTimerStart = 0;
        var timerPausedFor = 0;
        var pauseStarted = 0;

        var now = getAbsoluteTime();
        for(i in videofiles) {
            videofiles[i].timer_events.sort(function(a, b) { return a.time - b.time; });
            for(j in videofiles[i].timer_events) {
                var evt = videofiles[i].timer_events[j];
                var evtTime = getAbsoluteTime(evt.time, i);

                if(evtTime > now) {
                    break;
                }

                if(evt.event == "start" && evtTime > lastTimerStart) {
                    lastTimerStart = evtTime;
                    timerPausedFor = 0;
                }
                if(evt.event == "pause") {
                    pauseStarted = evtTime;
                }
                if(evt.event == "unpause") {
                    timerPausedFor += evtTime - pauseStarted;
                    pauseStarted = 0;
                }
            }

            if(videofiles[i].filename == currentvideo.filename) {
                break;
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

function setTimer() {
    var timeLeft = currentGameTime();
    $("#timer-box")
        .html(formatTime(timeLeft).substr(0, 5))
        .css({"left": $("video").width() - $("#timer-box").width()});
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

        data += 'files:\n';
        for(i in videofiles) {
            data += '  - name: "' + videofiles[i].filename + '"\n';
            data += '    goals:\n';
            for(j in videofiles[i].goals) {
                var goal = videofiles[i].goals[j];
                data += '    - { team: "' + goal.team + '", time: "' + formatTime(goal.time) + '" }\n';
            }
            data += '    timer_events:\n';
            for(j in videofiles[i].timer_events) {
                var event = videofiles[i].timer_events[j];
                data += '    - { timer: ' + event.timer + ', event: ' + event.event + ', time: "' + formatTime(event.time) + '" }\n';
            }

            data += '\n';
        }

        var blob = new Blob([data], { type: "text/x-yaml" });
        $(".game-link").attr("href", window.URL.createObjectURL(blob));
    }

    function updateClipsLink() {
        data = 'include:\n' +
            ' - defaults.yaml\n' +
            ' - game.yaml\n' +
            ' - youtube.yaml\n' +
            '\n';

        data += "files:\n";
        for(i in videofiles) {
            data += '  - name: "' + videofiles[i].filename + '"\n';
            data += '    clips:\n';
            for(j in videofiles[i].clips) {
                var clip = videofiles[i].clips[j];
                data += '    - { start: "' + formatTime(clip.start) + '", end: "' + formatTime(clip.end) + '"';
                if(clip.zoom) {
                    data += ', pre_effects: [["crop", ' + clip.zoom.x1 + ', ' + clip.zoom.y1 + ', ' + clip.zoom.x2 + ', ' + clip.zoom.y2
                        + '], ["resize", {"width": ' + player.videoWidth() + ', "height": ' + player.videoHeight() + '}]]';
                }

                data += ' }\n';
            }
            data += '\n';
        }

        var blob = new Blob([data], { type: "text/x-yaml" });
        $(".clips-link").attr("href", window.URL.createObjectURL(blob));
    }

    function updateLocalStorage() {
        $.each(videofiles, function(i, videofile) {
            storage.setItem(videofile.filename, JSON.stringify(videofile));
        });
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

        $("#video-object")
            .attr("height", newHeight)
            .attr("width", newWidth)
            .css({"height": newHeight, "width": newWidth});

        $(".boxes").css("left", newWidth + 20);
    }

    function updateCurrentClip() {
        if(player.duration()) {
            currentvideo.duration = player.duration();
        }

        $("#clip-file").val(currentclip.file);

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
        var container = $(".files-loaded .inputs").not(".editbox .inputs");
        container.empty();
        $.each(videofiles, function(i, videofile) {
            $("<div/>").addClass("row selectable").text(videofile.filename).attr("videourl", videofile.url).appendTo(container);
        });

        if(currentvideo) {
            container.find(".row[videourl='" + currentvideo.url + "']").addClass("selected");
        }
    }

    function updateGameEvents() {
        var events = [];
        var container = $(".timer-events .inputs").not(".editbox .inputs");

        $.each(currentvideo.timer_events, function(i, event) {
            var event = {"idx": i, "time": event.time, "type": "timer", "title": (event.event.substring(0, 1).toUpperCase() + event.event.slice(1)) + " " + event.timer};
            events.push(event);
        });

        $.each(currentvideo.goals, function(i, goal) {
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
        var clips = [];
        var container = $(".video-clips .inputs").not(".editbox .inputs");

        $.each(currentvideo.clips, function(i, clip) {
            var indexedClip = {"idx": i, "start": clip.start, "end": clip.end};
            clips.push(indexedClip);
        });

        clips.sort(function(a, b) { return a.start - b.start; });
        $.each(clips, function(i, clip) {
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
    }

    function setTextColor(input) {
        var textColor = $.Color(input.css("background-color")).contrastColor();
        input.css("color", textColor);
    }

    function selectVideoFile() {
        var $this = $(this);
        $this.closest(".inputs").find(".selectable").removeClass("selected");
        $this.addClass("selected");

        $.each(videofiles, function(i, videofile) {
            if(videofile.url == $this.attr("videourl")) {
                currentvideo = videofile;
            }
        });

        $("video").attr("src", $this.attr("videourl"));
        forceUpdateGameEvents();
        forceUpdateClipList();
    }

    function selectGoal() {
        var $this = $(this);

        var isSelected = $this.hasClass("selected");
        var editbox = $(".editbox.goal");
        var goal = currentvideo.goals[$this.attr("idx")];

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

        currentvideo.goals.splice(row.attr("idx"), 1);
        forceUpdateGameEvents();
        updateData();
    }

    function deleteTimer(e) {
        var $this = $(this);
        var row = $this.closest(".row.timer");

        e.stopPropagation();

        currentvideo.timer_events.splice(row.attr("idx"), 1);
        forceUpdateGameEvents();
        updateData();
    }

    function deleteClip(e) {
        var $this = $(this);
        var row = $this.closest(".row");

        e.stopPropagation();

        currentvideo.clips.splice(row.attr("idx"), 1);
        forceUpdateClipList();
        updateData();
    }

    function editGoal() {
        var selected = $(".timer-events .row.goal.selected");
        var goal = currentvideo.goals[selected.attr("idx")];

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
        var event = currentvideo.timer_events[$this.attr("idx")];

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
        var event = currentvideo.timer_events[selected.attr("idx")];

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
        var clip = currentvideo.clips[$this.attr("idx")];

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
        var clip = currentvideo.clips[selected.attr("idx")];

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
            var clipvideo = currentvideo;
            $.each(videofiles, function(i, videofile) {
                if(videofile.filename == currentclip.file) {
                    clipvideo = videofile;
                }
            });

            if(clipvideo.filename != currentvideo.filename) {
                currentclip.end += clipvideo.duration;
            }

            clipvideo.clips.push(currentclip);
            currentclip = {};
            updateClipList();
            updateCurrentClip();
            updateData();
        }
    }

    function addTimerEvent(eventtime) {
        var timerNameIndex = 0;
        var timerEvent = "start";

        if(currentvideo.timer_events.length > 0) {
            var lastEvent = currentvideo.timer_events[currentvideo.timer_events.length - 1];
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
        currentvideo.timer_events.push(event);
        updateGameEvents();
        updateData();
    }

    function addGoal(eventtime) {
        var event = {"team": "away", "time": eventtime};
        currentvideo.goals.push(event);
        updateGameEvents();
        updateData();
    }

    function divDrop(e) {
        e.preventDefault();

        e.dropEffect = "link";

        var reader = new FileReader();
        $.each(e.originalEvent.dataTransfer.files, function(i, file) {
            var videourl = window.URL.createObjectURL(file);
            var videofile = file.name in storage ? JSON.parse(storage.getItem(file.name)) : {"filename": file.name, "clips": [], "goals": [], "timer_events": []};
            videofile.url = videourl;

            videofiles.push(videofile);
        });

        updateVideoFiles();
        updateLocalStorage();

        if(!currentvideo) {
            $(".files-loaded .inputs .row").first().click();
        }
    }

    function getZoomValues() {
    }

    function zoomClick(e) {
        e.stopPropagation();
        e.preventDefault();

        if($("#zoom-box").hasClass("active")) {
            var $videoObj = $("#video-object"), $zoomBox = $("#zoom-box");
            var x1 = $zoomBox.offset().left - $videoObj.offset().left, y1 = $zoomBox.offset().top - $videoObj.offset().top;
            var x2 = x1 + $zoomBox.width(), y2 = y1 + $zoomBox.height();

            x1 = Math.floor(x1 / $videoObj.width() * player.videoWidth());
            x2 = Math.floor(x2 / $videoObj.width() * player.videoWidth());
            y1 = Math.floor(y1 / $videoObj.height() * player.videoHeight());
            y2 = Math.floor(y2 / $videoObj.height() * player.videoHeight());

            currentclip.zoom = {"x1": x1, "x2": x2, "y1": y1, "y2": y2};
            updateCurrentClip();

            $("#video-object").removeClass("zooming");
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
            var $videoObj = $("#video-object");
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

        $("#video-object").toggleClass("zooming");
    }

    function readKey(e) {
        switch(e.which) {
        case 73:  // I
            currentclip.start = player.currentTime();
            currentclip.file = currentvideo.filename;
            updateCurrentClip();
            break;

        case 79:  // O
            currentclip.end = player.currentTime();
            updateCurrentClip();
            break;

        case 65:  // A
            saveCurrentClip();
            break;

        case 70:  // F
            if(player.isFullscreen()) {
                player.exitFullscreen();
            } else {
                player.requestFullscreen();
            }

            break;

        case 71:  // G
            addGoal(player.currentTime());
            break;

        case 84:  // T
            addTimerEvent(player.currentTime());
            break;

        case 90:  // Z
            toggleZoom(e);
            break;

        case 190: // >
            player.playbackRate(player.playbackRate() * 1.5);
            break;

        case 188: // <
            player.playbackRate(player.playbackRate() / 1.5);
            break;

        case 191:  // /
            player.playbackRate(1.0);
            break;

        case 32:  // space
            player.paused() ? player.play() : player.pause();
            break;

        case 39:  // right
            player.currentTime(player.currentTime() + 5);
            break;

        case 37:  // left
            player.currentTime(player.currentTime() - 5);
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
