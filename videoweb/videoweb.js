var videoweb = function() {
    var player, origWidth, origHeight;
    var currentvideo = null, currentclip = {};
    var storage = window.localStorage;
    var videofiles = [];

    $(document).ready(function() {

        // Bind events
        $(".files-loaded").on("click", ".row", selectVideoFile);
        $(".timer-events").on("click", ".selectable.row.goal", selectGoal);
        $(".timer-events").on("click", ".selectable.row.goal .delete", deleteGoal);
        $(".timer-events").on("click", ".selectable.row.timer", selectTimer);
        $(".timer-events").on("click", ".selectable.row.timer .delete", deleteTimer);
        $(".editbox.goal").on("change", "input, select", editGoal);
        $(".editbox.timer").on("change", "input, select", editTimer);
        $(".box.game-info").on("change", "input, select", updateData);
        $(".boxes").on("click", ".title", toggleBox);

        // Set up and resize player
        player = videojs("video-object");
        origWidth = $("#video-object").width();
        origHeight = $("#video-object").height();
        resizePlayer();
        $(window).resize(resizePlayer);

        // Watch for files being dragged/dropped
        setupFileReader();

        // Set up color boxes
        $("input.color").change(function(e) {
            $(this).css("background-color", $(this).val());
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

    function formatTime(seconds) {
        var minutes = parseInt(seconds / 60);
        seconds = seconds % 60;

        var str = (minutes < 10 ? "0" : "") + minutes + ":";
        str += (seconds < 10 ? "0" : "") + parseInt(seconds) + ".";

        var cs = parseInt((seconds - parseInt(seconds)) * 100);
        str += (cs < 10 ? "0" : "") + cs;

        return str;
    }

    function parseTime(timestr) {
        return timestr.split(":").reverse()
            .map(function(v, i) { return parseFloat(v) * Math.pow(60, i); })
            .reduce(function(p, c) { return p + c; });
    }

    function updateGameLink() {
        data = 'home_team:\n' +
            '  name: ' + $("input[name=home-team]").val() + '\n' +
            '  color: "' + $("input[name=home-team-color]").val() + '"\n' +
            '\n' +
            'away_team:\n' +
            '  name: ' + $("input[name=away-team]").val() + '\n' +
            '  color: "' + $("input[name=away-team-color]").val() + '"\n' +
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
            '\n';

        data += "files:\n";
        for(i in videofiles) {
            data += '  - name: "' + videofiles[i].filename + '"\n';
            data += '    clips:\n';
            for(j in videofiles[i].clips) {
                var clip = videofiles[i].clips[j];
                data += '    - { start: "' + formatTime(clip.start) + '", end: "' + formatTime(clip.end) + '" }\n';
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

        newWidth = Math.min($(window).width() - 500, origWidth);
        newHeight = Math.floor(newWidth * (origHeight / origWidth));

        $("#video-object")
            .attr("height", newHeight)
            .attr("width", newWidth)
            .css({"height": newHeight, "width": newWidth});

        $(".boxes").css("left", newWidth + 20);
    }

    function updateCurrentClip() {
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
        var container = $(".video-clips .inputs");
        container.empty();
        $.each(videofiles, function(i, videofile) {
            $.each(videofile.clips, function(j, clip) {
                var infocells = [
                    $("<div/>").addClass("infocell").text(clip.file),
                    $("<div/>").addClass("infocell").text(formatTime(clip.start)),
                    $("<div/>").addClass("infocell").text(formatTime(clip.end))
                ];

                $("<div/>").addClass("row selectable").attr("start", clip.start).append(infocells).appendTo(container);
            });
        });
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

    function saveCurrentClip() {
        if(currentclip.start && currentclip.end) {
            currentvideo.clips.push(currentclip);
            currentclip = {};
            updateClipList();
            updateCurrentClip();
            updateData();
        }
    }

    function addTimerEvent(eventtime) {
        var event = {"timer": "Untitled", "event": "start", "time": eventtime};
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

        case 71:  // G
            addGoal(player.currentTime());
            break;

        case 84:  // T
            addTimerEvent(player.currentTime());
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
