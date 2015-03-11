var videoweb = function() {
    var player, origWidth, origHeight;
    var videofiles = [];

    $(document).ready(function() {
        player = videojs("video-object");

        setupFileReader();

        origWidth = $("#video-object").width();
        origHeight = $("#video-object").height();
        resizePlayer();

        $("input.color").change(function(e) {
            console.log($(this).val());
            $(this).css("background-color", $(this).val());
        });

        $("input.datepicker").datepicker({dateFormat: "yy-mm-dd"});
    });

    function resizePlayer() {
        if($("#video-object").width() + 500 > $(window).width()) {
            console.log($(window).width());
            newWidth = $(window).width() - 500;
            newHeight = Math.floor(newWidth * $("#video-object").height() / $("#video-object").width());

            $("#video-object")
                .attr("height", newHeight)
                .attr("width", newWidth)
                .css({"height": newHeight, "width": newWidth});

            $(".boxes").css("left", newWidth + 20);

            console.log("%sx%s", newWidth, newHeight);
        }
    }

    function updateVideoFiles() {
        var container = $(".files-loaded .box-body");
        container.empty();
        $.each(videofiles, function(i, videofile) {
            $("<div/>").addClass("row selectable").text(videofile.filename).attr("videourl", videofile.url).appendTo(container);
        });

        container.children(".row").click(selectVideoFile);
    }

    function selectVideoFile() {
        $(this).closest(".box-body").children(".selectable").removeClass("selected");
        $(this).addClass("selected");
        $("video").attr("src", $(this).attr("videourl"));
    }

    function divDrop(e) {
        e.preventDefault();

        e.dropEffect = "link";

        var reader = new FileReader();
        $.each(e.originalEvent.dataTransfer.files, function(i, file) {
            var videourl = window.URL.createObjectURL(file);
            console.log(file);
            videofiles.push({"url": videourl, "filename": file.name});
        });

        updateVideoFiles();
    }

    function readKey(e) {
        switch(e.which) {
        case 73:  // I
            console.log("IN at %s", player.currentTime());
            break;

        case 79:  // O
            console.log("OUT at %s", player.currentTime());
            break;

        case 71:  // G
            console.log("GOAL at %s", player.currentTime());
            break;

        case 84:  // T
            console.log("TIMER EVENT at %s", player.currentTime());
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

            // 39 right
            // 37 left
            //    32 //space
            //    83 115 //s

        }

        console.log(e.which);
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
