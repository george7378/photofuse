var PhotoFuse =
{
  fuseImages : function(gl, images)
  {
    /////////////
    // Objects //
    /////////////
    
    function WorkingTexture(texture, width, height, type)
    {
      this.texture = texture;
      this.width = width;
      this.height = height;
      this.type = type;
    }
    
    function RenderTarget(workingTexture, frameBuffer)
    {
      this.workingTexture = workingTexture;
      this.frameBuffer = frameBuffer;
    }
    
    
    /////////////
    // Globals //
    /////////////
    
    var quadPositionBuffer;
    var weightMapProgramInfo, filterHProgramInfo, filterVProgramInfo, downsampleProgramInfo, upsampleProgramInfo, addProgramInfo, subtractProgramInfo, multiplyProgramInfo, divideProgramInfo;
    
    
    ///////////////////
    // Shader source //
    ///////////////////
    
    var vertexShaderSource =
    `
      attribute vec2 a_position;
      
      varying vec2 v_texCoords;
      
      void main()
      {
        v_texCoords = (a_position + 1.0)/2.0;
        
        gl_Position = vec4(a_position, 0, 1);
      }
      
    `;
    
    var weightMapFragmentShaderSource =
    `
      precision mediump float;
      
      uniform sampler2D u_inputImage;
      
      uniform vec2 u_inputImageSize;
      
      uniform float u_contrastExponent;
      uniform float u_saturationExponent;
      uniform float u_exposureExponent;
      
      varying vec2 v_texCoords;
      
      float getGrayscaleValue(vec4 colour)
      {
        return 0.2989*colour.r + 0.5870*colour.g + 0.1140*colour.b;
      }
      
      void main()
      {
        vec2 pixelStep = vec2(1, 1)/u_inputImageSize;
        vec4 colour = texture2D(u_inputImage, v_texCoords);
        
        float weight = 1.0;
        
        if (u_contrastExponent > 0.0)
        {
          float grayscaleValue = getGrayscaleValue(colour);
          float grayscaleValueUp = getGrayscaleValue(texture2D(u_inputImage, v_texCoords + vec2(0, -pixelStep.y)));
          float grayscaleValueDown = getGrayscaleValue(texture2D(u_inputImage, v_texCoords + vec2(0, pixelStep.y)));
          float grayscaleValueLeft = getGrayscaleValue(texture2D(u_inputImage, v_texCoords + vec2(-pixelStep.x, 0)));
          float grayscaleValueRight = getGrayscaleValue(texture2D(u_inputImage, v_texCoords + vec2(pixelStep.x, 0)));
          
          float contrastMeasure = abs(-4.0*grayscaleValue + grayscaleValueUp + grayscaleValueDown + grayscaleValueLeft + grayscaleValueRight);
          
          weight *= pow(contrastMeasure, u_contrastExponent);
        }
        
        if (u_saturationExponent > 0.0)
        {
          float pixelMean = (colour.r + colour.g + colour.b)/3.0;
          float pixelVariance = (pow(colour.r - pixelMean, 2.0) + pow(colour.g - pixelMean, 2.0) + pow(colour.b - pixelMean, 2.0))/3.0;
          
          float saturationMeasure = sqrt(pixelVariance);
          
          weight *= pow(saturationMeasure, u_saturationExponent);
        }
        
        if (u_exposureExponent > 0.0)
        {
          float gaussIntensityRed = exp(-pow(colour.r - 0.5, 2.0)/0.08);
          float gaussIntensityGreen = exp(-pow(colour.g - 0.5, 2.0)/0.08);
          float gaussIntensityBlue = exp(-pow(colour.b - 0.5, 2.0)/0.08);
          
          float exposureMeasure = gaussIntensityRed*gaussIntensityGreen*gaussIntensityBlue;
          
          weight *= pow(exposureMeasure, u_exposureExponent);
        }
        
        weight += 1e-10;
        
        gl_FragColor = vec4(weight, weight, weight, 1);
      }
      
    `;
    
    var filterHFragmentShaderSource =
    `
      precision mediump float;
      
      uniform sampler2D u_inputImage;
      
      uniform float u_inputImageWidth;
      
      varying vec2 v_texCoords;
      
      void main()
      {
        vec2 pixelStep = vec2(1.0/u_inputImageWidth, 0);
        
        vec3 colour = texture2D(u_inputImage, v_texCoords).rgb;
        vec3 colourLeft = texture2D(u_inputImage, v_texCoords - pixelStep).rgb;
        vec3 colourTwoLeft = texture2D(u_inputImage, v_texCoords - 2.0*pixelStep).rgb;
        vec3 colourRight = texture2D(u_inputImage, v_texCoords + pixelStep).rgb;
        vec3 colourTwoRight = texture2D(u_inputImage, v_texCoords + 2.0*pixelStep).rgb;
        
        gl_FragColor = vec4(0.0625*colourTwoLeft + 0.25*colourLeft + 0.375*colour + 0.25*colourRight + 0.0625*colourTwoRight, 1);
      }
      
    `;
    
    var filterVFragmentShaderSource =
    `
      precision mediump float;
      
      uniform sampler2D u_inputImage;
      
      uniform float u_inputImageHeight;
      
      varying vec2 v_texCoords;
      
      void main()
      {
        vec2 pixelStep = vec2(0, 1.0/u_inputImageHeight);
        
        vec3 colour = texture2D(u_inputImage, v_texCoords).rgb;
        vec3 colourUp = texture2D(u_inputImage, v_texCoords - pixelStep).rgb;
        vec3 colourTwoUp = texture2D(u_inputImage, v_texCoords - 2.0*pixelStep).rgb;
        vec3 colourDown = texture2D(u_inputImage, v_texCoords + pixelStep).rgb;
        vec3 colourTwoDown = texture2D(u_inputImage, v_texCoords + 2.0*pixelStep).rgb;
        
        gl_FragColor = vec4(0.0625*colourTwoUp + 0.25*colourUp + 0.375*colour + 0.25*colourDown + 0.0625*colourTwoDown, 1);
      }
      
    `;
    
    var downsampleFragmentShaderSource =
    `
      precision mediump float;
      
      uniform sampler2D u_inputImage;
      
      uniform vec2 u_inputImageSize;
      
      varying vec2 v_texCoords;
      
      void main()
      {
        vec2 pixelCorrection = vec2(-0.5, -0.5)/u_inputImageSize;
        
        gl_FragColor = vec4(texture2D(u_inputImage, v_texCoords + pixelCorrection).rgb, 1);
      }
    
    `;
    
    var upsampleFragmentShaderSource =
    `
      precision mediump float;
      
      uniform sampler2D u_inputImage;
      
      varying vec2 v_texCoords;
      
      void main()
      {
        gl_FragColor = vec4(texture2D(u_inputImage, v_texCoords).rgb, 1);
      }
    
    `;
    
    var addFragmentShaderSource =
    `
      precision mediump float;
      
      uniform sampler2D u_inputImage1;
      uniform sampler2D u_inputImage2;

      varying vec2 v_texCoords;
      
      void main()
      {
        gl_FragColor = vec4(texture2D(u_inputImage1, v_texCoords).rgb + texture2D(u_inputImage2, v_texCoords).rgb, 1);
      }
    
    `;
    
    var subtractFragmentShaderSource =
    `
      precision mediump float;
      
      uniform sampler2D u_inputImage1;
      uniform sampler2D u_inputImage2;

      varying vec2 v_texCoords;
      
      void main()
      {
        gl_FragColor = vec4(texture2D(u_inputImage1, v_texCoords).rgb - texture2D(u_inputImage2, v_texCoords).rgb, 1);
      }
    
    `;
    
    var multiplyFragmentShaderSource =
    `
      precision mediump float;
      
      uniform sampler2D u_inputImage1;
      uniform sampler2D u_inputImage2;

      varying vec2 v_texCoords;
      
      void main()
      {
        gl_FragColor = vec4(texture2D(u_inputImage1, v_texCoords).rgb*texture2D(u_inputImage2, v_texCoords).rgb, 1);
      }
    
    `;
    
    var divideFragmentShaderSource =
    `
      precision mediump float;
      
      uniform sampler2D u_inputImage1;
      uniform sampler2D u_inputImage2;

      varying vec2 v_texCoords;
      
      void main()
      {
        gl_FragColor = vec4(texture2D(u_inputImage1, v_texCoords).rgb/texture2D(u_inputImage2, v_texCoords).rgb, 1);
      }
    
    `;
    
    
    /////////////////////
    // WebGL functions //
    /////////////////////
    
    function createShader(gl, shaderType, shaderSource)
    {
      var shader = gl.createShader(shaderType);
      gl.shaderSource(shader, shaderSource);
      gl.compileShader(shader);
      
      return shader;
    }

    function createShaderProgram(gl, vertexShader, fragmentShader)
    {
      var program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      
      return program;
    }
    
    // Result is RGBA, UNSIGNED_BYTE
    function createImageWorkingTexture(gl, image)
    {
      var texture = gl.createTexture();
      
      gl.bindTexture(gl.TEXTURE_2D, texture);
      
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      
      return new WorkingTexture(texture, image.width, image.height, gl.UNSIGNED_BYTE);
    }
    
    // Result is RGBA, type
    function createRenderTarget(gl, width, height, type)
    {
      // Create render target texture
      var texture = gl.createTexture();
      
      gl.bindTexture(gl.TEXTURE_2D, texture);
      
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, type, null);
      
      // Create render target frame buffer
      var frameBuffer = gl.createFramebuffer();
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
      
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      
      return new RenderTarget(new WorkingTexture(texture, width, height, type), frameBuffer);
    }
    
    function drawQuad(gl, programInfo, programUniformValues)
    {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      // Set attribute values
      gl.bindBuffer(gl.ARRAY_BUFFER, quadPositionBuffer);
      
      gl.vertexAttribPointer(programInfo.attributeLocations.position, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(programInfo.attributeLocations.position);
      
      gl.useProgram(programInfo.program);
      
      // Set uniform values
      programInfo.uniformSetter(gl, programUniformValues);
    
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    
    function addTexturesIntoRenderTarget(gl, texture1, texture2, renderTarget)
    {
      gl.viewport(0, 0, renderTarget.workingTexture.width, renderTarget.workingTexture.height);
      
      var addProgramUniformValues =
      {
        inputImage1: texture1,
        inputImage2: texture2
      };
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget.frameBuffer);
      
      drawQuad(gl, addProgramInfo, addProgramUniformValues);
    }
    
    function subtractTexturesIntoRenderTarget(gl, texture1, texture2, renderTarget)
    {
      gl.viewport(0, 0, renderTarget.workingTexture.width, renderTarget.workingTexture.height);
      
      var subtractProgramUniformValues =
      {
        inputImage1: texture1,
        inputImage2: texture2
      };
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget.frameBuffer);
      
      drawQuad(gl, subtractProgramInfo, subtractProgramUniformValues);
    }
    
    function multiplyTexturesIntoRenderTarget(gl, texture1, texture2, renderTarget)
    {
      gl.viewport(0, 0, renderTarget.workingTexture.width, renderTarget.workingTexture.height);
      
      var multiplyProgramUniformValues =
      {
        inputImage1: texture1,
        inputImage2: texture2
      };
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget.frameBuffer);
      
      drawQuad(gl, multiplyProgramInfo, multiplyProgramUniformValues);
    }
    
    function divideTexturesIntoRenderTarget(gl, texture1, texture2, renderTarget)
    {
      gl.viewport(0, 0, renderTarget.workingTexture.width, renderTarget.workingTexture.height);
      
      var divideProgramUniformValues =
      {
        inputImage1: texture1,
        inputImage2: texture2
      };
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget.frameBuffer);
      
      drawQuad(gl, divideProgramInfo, divideProgramUniformValues);
    }
    
    // Requires RGBA, UNSIGNED_BYTE
    function createWorkingTextureImage(gl, workingTexture)
    {
      var frameBuffer = gl.createFramebuffer();
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
      
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, workingTexture.texture, 0);
      
      var data = new Uint8Array(workingTexture.width*workingTexture.height*4);
      gl.readPixels(0, 0, workingTexture.width, workingTexture.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      
      var canvas = document.createElement("canvas");
      canvas.width = workingTexture.width;
      canvas.height = workingTexture.height;
      
      var context = canvas.getContext("2d");
      var imageData = context.createImageData(canvas.width, canvas.height);
      
      imageData.data.set(data);
      context.putImageData(imageData, 0, 0);
      
      var image = new Image();
      image.src = canvas.toDataURL("image/png");
      
      return image;
    }
    
    
    /////////////////////////
    // Algorithm functions //
    /////////////////////////
    
    // Result is RGBA, FLOAT
    function createWeightMapWorkingTexture(gl, imageWorkingTexture)
    {
      var weightMapRenderTarget = createRenderTarget(gl, imageWorkingTexture.width, imageWorkingTexture.height, gl.FLOAT);
      
      gl.viewport(0, 0, weightMapRenderTarget.workingTexture.width, weightMapRenderTarget.workingTexture.height);
      
      var weightMapProgramUniformValues =
      {
        inputImage: imageWorkingTexture.texture,
        inputImageSize: [imageWorkingTexture.width, imageWorkingTexture.height],
        contrastExponent: 1,
        saturationExponent: 1,
        exposureExponent: 1
      };
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, weightMapRenderTarget.frameBuffer);
      
      drawQuad(gl, weightMapProgramInfo, weightMapProgramUniformValues);
      
      return weightMapRenderTarget.workingTexture;
    }
    
    // Results are RGBA, UNSIGNED_BYTE
    function normaliseWeightMapWorkingTextures(gl, weightMapWorkingTextures)
    {
      var weightMapTotalRenderTarget = createRenderTarget(gl, weightMapWorkingTextures[0].width, weightMapWorkingTextures[0].height, gl.FLOAT);
      for (var i = 0; i < weightMapWorkingTextures.length; i++)
      {
        var weightMapCurrentTotalRenderTarget = createRenderTarget(gl, weightMapWorkingTextures[i].width, weightMapWorkingTextures[i].height, gl.FLOAT);
        
        addTexturesIntoRenderTarget(gl, weightMapTotalRenderTarget.workingTexture.texture, weightMapWorkingTextures[i].texture, weightMapCurrentTotalRenderTarget);
        
        weightMapTotalRenderTarget = weightMapCurrentTotalRenderTarget;
      }
      
      var weightMapNormalisedWorkingTextures = [];
      for (var i = 0; i < weightMapWorkingTextures.length; i++)
      {
        var weightMapNormalisedRenderTarget = createRenderTarget(gl, weightMapWorkingTextures[i].width, weightMapWorkingTextures[i].height, gl.UNSIGNED_BYTE);
        
        divideTexturesIntoRenderTarget(gl, weightMapWorkingTextures[i].texture, weightMapTotalRenderTarget.workingTexture.texture, weightMapNormalisedRenderTarget);
        
        weightMapNormalisedWorkingTextures.push(weightMapNormalisedRenderTarget.workingTexture);
      }
      
      return weightMapNormalisedWorkingTextures;
    }
    
    // Result is RGBA, workingTexture.type
    function filterWorkingTexture(gl, workingTexture)
    {
      // Filter horizontally
      var filterHRenderTarget = createRenderTarget(gl, workingTexture.width, workingTexture.height, workingTexture.type);
      
      gl.viewport(0, 0, filterHRenderTarget.workingTexture.width, filterHRenderTarget.workingTexture.height);
      
      var filterHProgramUniformValues =
      {
        inputImage: workingTexture.texture,
        inputImageWidth: workingTexture.width
      };
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, filterHRenderTarget.frameBuffer);
      
      drawQuad(gl, filterHProgramInfo, filterHProgramUniformValues);
      
      // Filter vertically
      var filterVRenderTarget = createRenderTarget(gl, workingTexture.width, workingTexture.height, workingTexture.type);
      
      gl.viewport(0, 0, filterVRenderTarget.workingTexture.width, filterVRenderTarget.workingTexture.height);
      
      var filterVProgramUniformValues =
      {
        inputImage: filterHRenderTarget.workingTexture.texture,
        inputImageHeight: filterHRenderTarget.workingTexture.height
      };
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, filterVRenderTarget.frameBuffer);
      
      drawQuad(gl, filterVProgramInfo, filterVProgramUniformValues);
      
      return filterVRenderTarget.workingTexture;
    }
    
    // Result is RGBA, workingTexture.type
    function downsampleWorkingTexture(gl, workingTexture)
    {
      var filteredWorkingTexture = filterWorkingTexture(gl, workingTexture);
      
      var downsampledTextureWidth = workingTexture.width % 2 == 0 ? workingTexture.width/2 : (workingTexture.width - 1)/2 + 1;
      var downsampledTextureHeight = workingTexture.height % 2 == 0 ? workingTexture.height/2 : (workingTexture.height - 1)/2 + 1;
      
      var downsampledRenderTarget = createRenderTarget(gl, downsampledTextureWidth, downsampledTextureHeight, workingTexture.type);
      
      gl.viewport(0, 0, downsampledRenderTarget.workingTexture.width, downsampledRenderTarget.workingTexture.height);
      
      var downsampleProgramUniformValues =
      {
        inputImage: filteredWorkingTexture.texture,
        inputImageSize: [filteredWorkingTexture.width, filteredWorkingTexture.height]
      };
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, downsampledRenderTarget.frameBuffer);
      
      drawQuad(gl, downsampleProgramInfo, downsampleProgramUniformValues);
      
      return downsampledRenderTarget.workingTexture;
    }
    
    // Result is RGBA, workingTexture.type
    function upsampleWorkingTexture(gl, workingTexture, oddX, oddY)
    {
      var upsampledTextureWidth = 2*workingTexture.width - oddX;
      var upsampledTextureHeight = 2*workingTexture.height - oddY;
      
      var upsampledRenderTarget = createRenderTarget(gl, upsampledTextureWidth, upsampledTextureHeight, workingTexture.type);
      
      gl.viewport(0, 0, upsampledRenderTarget.workingTexture.width, upsampledRenderTarget.workingTexture.height);
      
      var upsampleProgramUniformValues =
      {
        inputImage: workingTexture.texture
      };
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, upsampledRenderTarget.frameBuffer);
      
      drawQuad(gl, upsampleProgramInfo, upsampleProgramUniformValues);
      
      return filterWorkingTexture(gl, upsampledRenderTarget.workingTexture);
    }
    
    // Results are RGBA, workingTexture.type
    function gaussianPyramid(gl, workingTexture, numberOfLevels)
    {
      var pyramid = [workingTexture];
    
      for (var l = 1; l < numberOfLevels; l++)
      {
        pyramid.push(downsampleWorkingTexture(gl, pyramid[l - 1]));
      }

      return pyramid;
    }
    
    // Results are RGBA, FLOAT (but lowest level is RGBA, workingTexture.type)
    function laplacianPyramid(gl, workingTexture, numberOfLevels)
    {
      var pyramid = [];
    
      var currentWorkingTexture = workingTexture;
      for (var l = 0; l < numberOfLevels - 1; l++)
      {
        var downsampledWorkingTexture = downsampleWorkingTexture(gl, currentWorkingTexture);
        
        var oddX = 2*downsampledWorkingTexture.width - currentWorkingTexture.width;
        var oddY = 2*downsampledWorkingTexture.height - currentWorkingTexture.height;
        var upsampledWorkingTexture = upsampleWorkingTexture(gl, downsampledWorkingTexture, oddX, oddY);
        
        var subtractionRenderTarget = createRenderTarget(gl, currentWorkingTexture.width, currentWorkingTexture.height, gl.FLOAT);
        
        subtractTexturesIntoRenderTarget(gl, currentWorkingTexture.texture, upsampledWorkingTexture.texture, subtractionRenderTarget);
        
        pyramid.push(subtractionRenderTarget.workingTexture);
        
        currentWorkingTexture = downsampledWorkingTexture;
      }
      pyramid.push(currentWorkingTexture);
      
      return pyramid;
    }
    
    // Result is RGBA, UNSIGNED_BYTE
    function reconstructLaplacianPyramid(gl, pyramid)
    {
      var result = pyramid[pyramid.length - 1];
      for (var l = pyramid.length - 2; l >= 0; l--)
      {
        var currentWorkingTexture = pyramid[l];
        
        var oddX = 2*result.width - currentWorkingTexture.width;
        var oddY = 2*result.height - currentWorkingTexture.height;
        
        var additionRenderTarget = createRenderTarget(gl, currentWorkingTexture.width, currentWorkingTexture.height, gl.UNSIGNED_BYTE);
        
        addTexturesIntoRenderTarget(gl, currentWorkingTexture.texture, upsampleWorkingTexture(gl, result, oddX, oddY).texture, additionRenderTarget);
        
        result = additionRenderTarget.workingTexture;
      }
      
      return result;
    }
    
    
    //////////////////
    // Main routine //
    //////////////////
    
    // Populate quad buffer to act as a drawing surface
    quadPositionBuffer = gl.createBuffer();
    
    gl.bindBuffer(gl.ARRAY_BUFFER, quadPositionBuffer);
    
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 1,   -1, 1,   1, -1,   -1, -1]), gl.STATIC_DRAW);
    
    // Load shaders and populate their program info
    var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    var weightMapFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, weightMapFragmentShaderSource);
    var filterHFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, filterHFragmentShaderSource);
    var filterVFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, filterVFragmentShaderSource);
    var downsampleFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, downsampleFragmentShaderSource);
    var upsampleFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, upsampleFragmentShaderSource);
    var addFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, addFragmentShaderSource);
    var subtractFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, subtractFragmentShaderSource);
    var multiplyFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, multiplyFragmentShaderSource);
    var divideFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, divideFragmentShaderSource);
    
    var weightMapShaderProgram = createShaderProgram(gl, vertexShader, weightMapFragmentShader);
    weightMapProgramInfo =
    {
      program: weightMapShaderProgram,
      attributeLocations:
      {
        position: gl.getAttribLocation(weightMapShaderProgram, "a_position")
      },
      uniformLocations:
      {
        inputImage: gl.getUniformLocation(weightMapShaderProgram, "u_inputImage"),
        inputImageSize: gl.getUniformLocation(weightMapShaderProgram, "u_inputImageSize"),
        contrastExponent: gl.getUniformLocation(weightMapShaderProgram, "u_contrastExponent"),
        saturationExponent: gl.getUniformLocation(weightMapShaderProgram, "u_saturationExponent"),
        exposureExponent: gl.getUniformLocation(weightMapShaderProgram, "u_exposureExponent")
      },
      uniformSetter: function(gl, uniformValues)
      {
        gl.uniform1i(this.uniformLocations.inputImage, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage);
 
        gl.uniform2f(this.uniformLocations.inputImageSize, uniformValues.inputImageSize[0], uniformValues.inputImageSize[1]);
         
        gl.uniform1f(this.uniformLocations.contrastExponent, uniformValues.contrastExponent);
        gl.uniform1f(this.uniformLocations.saturationExponent, uniformValues.saturationExponent);
        gl.uniform1f(this.uniformLocations.exposureExponent, uniformValues.exposureExponent);
      }
    };
     
    var filterHShaderProgram = createShaderProgram(gl, vertexShader, filterHFragmentShader);
    filterHProgramInfo =
    {
      program: filterHShaderProgram,
      attributeLocations:
      {
        position: gl.getAttribLocation(filterHShaderProgram, "a_position")
      },
      uniformLocations:
      {
        inputImage: gl.getUniformLocation(filterHShaderProgram, "u_inputImage"),
        inputImageWidth: gl.getUniformLocation(filterHShaderProgram, "u_inputImageWidth")
      },
      uniformSetter: function(gl, uniformValues)
      {
        gl.uniform1i(this.uniformLocations.inputImage, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage);
         
        gl.uniform1f(this.uniformLocations.inputImageWidth, uniformValues.inputImageWidth);
      }
    };
     
    var filterVShaderProgram = createShaderProgram(gl, vertexShader, filterVFragmentShader);
    filterVProgramInfo =
    {
      program: filterVShaderProgram,
      attributeLocations:
      {
        position: gl.getAttribLocation(filterVShaderProgram, "a_position")
      },
      uniformLocations:
      {
        inputImage: gl.getUniformLocation(filterVShaderProgram, "u_inputImage"),
        inputImageHeight: gl.getUniformLocation(filterVShaderProgram, "u_inputImageHeight")
      },
      uniformSetter: function(gl, uniformValues)
      {
        gl.uniform1i(this.uniformLocations.inputImage, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage);
         
        gl.uniform1f(this.uniformLocations.inputImageHeight, uniformValues.inputImageHeight);
      }
    };
    
    var downsampleShaderProgram = createShaderProgram(gl, vertexShader, downsampleFragmentShader);
    downsampleProgramInfo =
    {
      program: downsampleShaderProgram,
      attributeLocations:
      {
        position: gl.getAttribLocation(downsampleShaderProgram, "a_position")
      },
      uniformLocations:
      {
        inputImage: gl.getUniformLocation(downsampleShaderProgram, "u_inputImage"),
        inputImageSize: gl.getUniformLocation(downsampleShaderProgram, "u_inputImageSize")
      },
      uniformSetter: function(gl, uniformValues)
      {
        gl.uniform1i(this.uniformLocations.inputImage, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage);
        
        gl.uniform2f(this.uniformLocations.inputImageSize, uniformValues.inputImageSize[0], uniformValues.inputImageSize[1]);
      }
    };
    
    var upsampleShaderProgram = createShaderProgram(gl, vertexShader, upsampleFragmentShader);
    upsampleProgramInfo =
    {
      program: upsampleShaderProgram,
      attributeLocations:
      {
        position: gl.getAttribLocation(upsampleShaderProgram, "a_position")
      },
      uniformLocations:
      {
        inputImage: gl.getUniformLocation(upsampleShaderProgram, "u_inputImage")
      },
      uniformSetter: function(gl, uniformValues)
      {
        gl.uniform1i(this.uniformLocations.inputImage, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage);
      }
    };
     
    var addShaderProgram = createShaderProgram(gl, vertexShader, addFragmentShader);
    addProgramInfo =
    {
      program: addShaderProgram,
      attributeLocations:
      {
        position: gl.getAttribLocation(addShaderProgram, "a_position")
      },
      uniformLocations:
      {
        inputImage1: gl.getUniformLocation(addShaderProgram, "u_inputImage1"),
        inputImage2: gl.getUniformLocation(addShaderProgram, "u_inputImage2")
      },
      uniformSetter: function(gl, uniformValues)
      {
        gl.uniform1i(this.uniformLocations.inputImage1, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage1);
         
        gl.uniform1i(this.uniformLocations.inputImage2, 1);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage2);
      }
    };
     
    var subtractShaderProgram = createShaderProgram(gl, vertexShader, subtractFragmentShader);
    subtractProgramInfo =
    {
      program: subtractShaderProgram,
      attributeLocations:
      {
        position: gl.getAttribLocation(subtractShaderProgram, "a_position")
      },
      uniformLocations:
      {
        inputImage1: gl.getUniformLocation(subtractShaderProgram, "u_inputImage1"),
        inputImage2: gl.getUniformLocation(subtractShaderProgram, "u_inputImage2")
      },
      uniformSetter: function(gl, uniformValues)
      {
        gl.uniform1i(this.uniformLocations.inputImage1, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage1);
         
        gl.uniform1i(this.uniformLocations.inputImage2, 1);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage2);
      }
    };
     
    var multiplyShaderProgram = createShaderProgram(gl, vertexShader, multiplyFragmentShader);
    multiplyProgramInfo =
    {
      program: multiplyShaderProgram,
      attributeLocations:
      {
        position: gl.getAttribLocation(multiplyShaderProgram, "a_position")
      },
      uniformLocations:
      {
        inputImage1: gl.getUniformLocation(multiplyShaderProgram, "u_inputImage1"),
        inputImage2: gl.getUniformLocation(multiplyShaderProgram, "u_inputImage2")
      },
      uniformSetter: function(gl, uniformValues)
      {
        gl.uniform1i(this.uniformLocations.inputImage1, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage1);
         
        gl.uniform1i(this.uniformLocations.inputImage2, 1);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage2);
      }
    };
     
    var divideShaderProgram = createShaderProgram(gl, vertexShader, divideFragmentShader);
    divideProgramInfo =
    {
      program: divideShaderProgram,
      attributeLocations:
      {
        position: gl.getAttribLocation(divideShaderProgram, "a_position")
      },
      uniformLocations:
      {
        inputImage1: gl.getUniformLocation(divideShaderProgram, "u_inputImage1"),
        inputImage2: gl.getUniformLocation(divideShaderProgram, "u_inputImage2")
      },
      uniformSetter: function(gl, uniformValues)
      {
        gl.uniform1i(this.uniformLocations.inputImage1, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage1);
         
        gl.uniform1i(this.uniformLocations.inputImage2, 1);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, uniformValues.inputImage2);
      }
    };
    
    // Create textures and normalised weight maps from images
    var imageWorkingTextures = [];
    var weightMapWorkingTextures = [];
    for (var i = 0; i < images.length; i++)
    {
      var imageWorkingTexture = createImageWorkingTexture(gl, images[i]);
      
      imageWorkingTextures.push(imageWorkingTexture);
      weightMapWorkingTextures.push(createWeightMapWorkingTexture(gl, imageWorkingTexture));
    }
    
    weightMapWorkingTextures = normaliseWeightMapWorkingTextures(gl, weightMapWorkingTextures);
    
    // Perform pyramid blending
    var numberOfLevels = Math.floor(Math.log(Math.min(images[0].width, images[0].height))/Math.log(2));
    var blendedPyramid = gaussianPyramid(gl, createRenderTarget(gl, images[0].width, images[0].height, gl.FLOAT).workingTexture, numberOfLevels);
    for (var i = 0; i < images.length; i++)
    {
      var weightMapGaussianPyramid = gaussianPyramid(gl, weightMapWorkingTextures[i], numberOfLevels);
      var imageLaplacianPyramid = laplacianPyramid(gl, imageWorkingTextures[i], numberOfLevels);
      
      for (var l = 0; l < numberOfLevels; l++)
      {
        var multiplicationRenderTarget = createRenderTarget(gl, imageLaplacianPyramid[l].width, imageLaplacianPyramid[l].height, gl.FLOAT);
        
        multiplyTexturesIntoRenderTarget(gl, imageLaplacianPyramid[l].texture, weightMapGaussianPyramid[l].texture, multiplicationRenderTarget);
        
        var additionRenderTarget = createRenderTarget(gl, blendedPyramid[l].width, blendedPyramid[l].height, gl.FLOAT);
        
        addTexturesIntoRenderTarget(gl, blendedPyramid[l].texture, multiplicationRenderTarget.workingTexture.texture, additionRenderTarget);
        
        blendedPyramid[l] = additionRenderTarget.workingTexture;
      }
    }
    
    // Reconstruct image
    var resultWorkingTexture = reconstructLaplacianPyramid(gl, blendedPyramid);
    
    return createWorkingTextureImage(gl, resultWorkingTexture);
  }
};
