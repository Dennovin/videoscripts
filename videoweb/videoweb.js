var videoweb = function() {
    var player, origWidth, origHeight;
    var videofiles = [];
    var currentvideo = null, currentclip = {};

    $(document).ready(function() {

        // Bind events
        $(".files-loaded").on("click", ".row", selectVideoFile);
        $(".timer-events").on("click", ".selectable.row.goal", selectGoal);
        $(".timer-events").on("click", ".selectable.row.timer", selectTimer);
        $(".editbox.goal").on("change", "input, select", editGoal);
        $(".editbox.timer").on("change", "input, select", editTimer);
        $(".box.game-info").on("change", "input, select", updateYamlFiles);

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

        // Display initial YAML
        updateYamlFiles();
    });

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

    function updateGameFile() {
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
                data += '    - { timer: ' + event.name + ', event: ' + event.event + ', time: "' + formatTime(event.time) + '" }\n';
            }

            data += '\n';
        }

        $(".game-yaml").text(data);
    }

    function updateClipsFile() {
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

        $(".clips-yaml").text(data);
    }

    function updateYamlFiles() {
        updateGameFile();
        updateClipsFile();
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
                $("<div/>").addClass("infocell").text(event.title)
            ];

            row.empty().append(infocells);
        });
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
        $(".editbox.goal").detach().appendTo("document");
        $(".timer-events .inputs").empty();
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
        updateYamlFiles();
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
        updateYamlFiles();
    }

    function saveCurrentClip() {
        if(currentclip.start && currentclip.end) {
            currentvideo.clips.push(currentclip);
            currentclip = {};
            updateClipList();
            updateCurrentClip();
            updateYamlFiles();
        }
    }

    function addTimerEvent(eventtime) {
        var event = {"timer": "Untitled", "event": "start", "time": eventtime};
        currentvideo.timer_events.push(event);
        updateGameEvents();
        updateYamlFiles();
    }

    function addGoal(eventtime) {
        var event = {"team": "away", "time": eventtime};
        currentvideo.goals.push(event);
        updateGameEvents();
        updateYamlFiles();
    }

    function divDrop(e) {
        e.preventDefault();

        e.dropEffect = "link";

        var reader = new FileReader();
        $.each(e.originalEvent.dataTransfer.files, function(i, file) {
            var videourl = window.URL.createObjectURL(file);

            videofiles.push({"url": videourl, "filename": file.name, "clips": [], "goals": [], "timer_events": []});
        });

        updateVideoFiles();

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

        case 90:  // Z
            player.playbackRate(1.0);
            break;

        case 32:
            player.paused() ? player.play() : player.pause();
            break;

        case 39:
            player.currentTime(player.currentTime() + 5);

        case 37:
            player.currentTime(player.currentTime() - 5);

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
