const fileInput = document.getElementById('fileInput');
const outputFormatSelect = document.getElementById('outputFormat');
const qualityContainer = document.getElementById('qualityContainer');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValueSpan = document.getElementById('qualityValue');
const convertButton = document.getElementById('convertButton');
const conversionResults = document.getElementById('conversionResults');
const downloadLink = document.getElementById('downloadLink');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const conversionSpinner = document.getElementById('conversionSpinner');
const conversionAlert = document.getElementById('conversionAlert');

// Update quality label when slider changes
qualitySlider.addEventListener('input', () => {
  qualityValueSpan.textContent = qualitySlider.value;
});

// Show or hide the quality slider based on output format selection
outputFormatSelect.addEventListener('change', () => {
  const selectedFormat = outputFormatSelect.value;
  qualityContainer.style.display =
    (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp') ? 'block' : 'none';
});

// Enable convert button when files are selected and clear previous results
fileInput.addEventListener('change', () => {
  convertButton.disabled = fileInput.files.length === 0;
  conversionResults.innerHTML = '';
  downloadLink.style.display = 'none';
  downloadLink.href = '';
  downloadLink.textContent = 'Download Converted File';
  // Hide any existing alert
  conversionAlert.classList.add('d-none');
});

// Helper: get file extension from filename
function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

// Convert native formats (PNG, JPEG, WEBP, GIF, BMP, SVG) using an Image element
function convertNativeImage(file, selectedFormat, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        let dataURL =
          (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp')
            ? canvas.toDataURL(selectedFormat, quality)
            : canvas.toDataURL(selectedFormat);
        resolve({ dataURL, width: img.width, height: img.height, pageNumber: 1 });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Convert TIFF using UTIF.js
function convertTIFF(file, selectedFormat, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      const ifds = UTIF.decode(buffer);
      UTIF.decodeImages(buffer, ifds);
      const first = ifds[0];
      const rgba = UTIF.toRGBA8(first);
      canvas.width = first.width;
      canvas.height = first.height;
      const imageData = ctx.createImageData(first.width, first.height);
      imageData.data.set(rgba);
      ctx.putImageData(imageData, 0, 0);
      let dataURL =
        (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp')
          ? canvas.toDataURL(selectedFormat, quality)
          : canvas.toDataURL(selectedFormat);
      resolve({ dataURL, width: first.width, height: first.height, pageNumber: 1 });
    };
    reader.readAsArrayBuffer(file);
  });
}

// Convert PSD using psd.js
function convertPSD(file, selectedFormat, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      PSD.fromArrayBuffer(buffer)
        .then(psd => psd.image.toPng())
        .then(pngDataURL => {
          const img = new Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            let dataURL =
              (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp')
                ? canvas.toDataURL(selectedFormat, quality)
                : canvas.toDataURL(selectedFormat);
            resolve({ dataURL, width: img.width, height: img.height, pageNumber: 1 });
          };
          img.src = pngDataURL;
        })
        .catch(reject);
    };
    reader.readAsArrayBuffer(file);
  });
}

// Convert ICO using icojs
function convertICO(file, selectedFormat, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      icojs.parse(buffer)
        .then(images => {
          let chosen = images.reduce((prev, curr) => (curr.width > prev.width ? curr : prev), images[0]);
          const img = new Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            let dataURL =
              (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp')
                ? canvas.toDataURL(selectedFormat, quality)
                : canvas.toDataURL(selectedFormat);
            resolve({ dataURL, width: img.width, height: img.height, pageNumber: 1 });
          };
          img.src = chosen.src;
        })
        .catch(reject);
    };
    reader.readAsArrayBuffer(file);
  });
}

// Convert PDF using pdf.js (all pages)
function convertPDF(file, selectedFormat, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      loadingTask.promise.then(pdf => {
        let pagePromises = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          pagePromises.push(
            pdf.getPage(i).then(page => {
              const viewport = page.getViewport({ scale: 1 });
              const tempCanvas = document.createElement('canvas');
              const tempCtx = tempCanvas.getContext('2d');
              tempCanvas.width = viewport.width;
              tempCanvas.height = viewport.height;
              const renderContext = {
                canvasContext: tempCtx,
                viewport: viewport
              };
              return page.render(renderContext).promise.then(() => {
                let dataURL =
                  (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp')
                    ? tempCanvas.toDataURL(selectedFormat, quality)
                    : tempCanvas.toDataURL(selectedFormat);
                return { dataURL, width: viewport.width, height: viewport.height, pageNumber: i };
              });
            })
          );
        }
        Promise.all(pagePromises).then(results => resolve(results)).catch(reject);
      }).catch(reject);
    };
    reader.readAsArrayBuffer(file);
  });
}

// Master conversion function
async function convertFile(file, selectedFormat, quality) {
  const ext = getFileExtension(file.name);
  let results = [];
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) {
    const res = await convertNativeImage(file, selectedFormat, quality);
    results.push(res);
  } else if (['tiff', 'tif'].includes(ext)) {
    const res = await convertTIFF(file, selectedFormat, quality);
    results.push(res);
  } else if (ext === 'psd') {
    const res = await convertPSD(file, selectedFormat, quality);
    results.push(res);
  } else if (ext === 'ico') {
    const res = await convertICO(file, selectedFormat, quality);
    results.push(res);
  } else if (ext === 'pdf') {
    results = await convertPDF(file, selectedFormat, quality);
  } else {
    throw new Error('Unsupported file format: ' + ext);
  }
  return results;
}

// Convert button click handler
convertButton.addEventListener('click', async () => {
  // Reset UI
  conversionResults.innerHTML = '';
  downloadLink.style.display = 'none';
  downloadLink.href = '';
  conversionAlert.classList.add('d-none');

  // Show spinner
  conversionSpinner.style.display = 'inline-flex';

  const files = fileInput.files;
  const selectedFormat = outputFormatSelect.value;
  const quality = parseFloat(qualitySlider.value);

  try {
    if (files.length === 1) {
      const file = files[0];
      const results = await convertFile(file, selectedFormat, quality);
      handleSingleFileResult(file, results, selectedFormat);
    } else {
      await handleMultipleFilesResult(files, selectedFormat, quality);
    }
    // Show success alert
    conversionAlert.classList.remove('d-none');
  } catch (error) {
    alert('Error converting files: ' + error.message);
  } finally {
    // Hide spinner
    conversionSpinner.style.display = 'none';
  }
});

function handleSingleFileResult(file, results, selectedFormat) {
  let newExtension = getExtensionByFormat(selectedFormat);
  let originalName = file.name;
  let baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;

  if (results.length === 1) {
    // Single page or single image
    let newFileName = baseName + newExtension;
    showPreview(results[0], newFileName);
    downloadLink.href = results[0].dataURL;
    downloadLink.download = newFileName;
    downloadLink.style.display = 'inline-block';
    downloadLink.textContent = 'Download ' + newFileName;
  } else {
    // Multi-page PDF
    zipMultipleResults(results, baseName, newExtension);
  }
}

async function handleMultipleFilesResult(files, selectedFormat, quality) {
  let zip = new JSZip();
  let conversionPromises = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const promise = convertFile(file, selectedFormat, quality)
      .then(results => {
        let newExtension = getExtensionByFormat(selectedFormat);
        let originalName = file.name;
        let baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
        if (results.length === 1) {
          let newFileName = baseName + newExtension;
          const base64Data = results[0].dataURL.split(',')[1];
          zip.file(newFileName, base64Data, { base64: true });
          showPreview(results[0], newFileName);
        } else {
          // Multi-page PDF or multi-result scenario
          results.forEach(item => {
            let newFileName = baseName + '_page' + item.pageNumber + newExtension;
            const base64Data = item.dataURL.split(',')[1];
            zip.file(newFileName, base64Data, { base64: true });
            showPreview(item, newFileName);
          });
        }
      })
      .catch(error => {
        throw new Error('Error converting file ' + file.name + ': ' + error.message);
      });
    conversionPromises.push(promise);
  }

  await Promise.all(conversionPromises);
  let content = await zip.generateAsync({ type: 'blob' });
  let zipUrl = URL.createObjectURL(content);
  downloadLink.href = zipUrl;
  downloadLink.download = 'converted_images.zip';
  downloadLink.style.display = 'inline-block';
  downloadLink.textContent = 'Download ZIP of Converted Images';
}

// Utility to get extension by format
function getExtensionByFormat(format) {
  if (format === 'image/jpeg') return '.jpeg';
  if (format === 'image/png') return '.png';
  if (format === 'image/webp') return '.webp';
  return '.img';
}

// Create a preview in the grid
function showPreview(result, fileName) {
  // result => { dataURL, pageNumber, width, height }
  let colDiv = document.createElement('div');
  colDiv.className = 'col-sm-6 col-md-4 col-lg-3';

  let resultItem = document.createElement('div');
  resultItem.className = 'result-item h-100 d-flex flex-column justify-content-center';

  let img = document.createElement('img');
  img.src = result.dataURL;
  img.alt = fileName;

  let p = document.createElement('p');
  p.textContent = fileName;
  p.className = 'mt-2 mb-0 text-truncate';

  resultItem.appendChild(img);
  resultItem.appendChild(p);
  colDiv.appendChild(resultItem);

  conversionResults.appendChild(colDiv);
}

// Zip multi-page results
function zipMultipleResults(results, baseName, newExtension) {
  let zip = new JSZip();
  results.forEach(item => {
    let newFileName = baseName + '_page' + item.pageNumber + newExtension;
    const base64Data = item.dataURL.split(',')[1];
    zip.file(newFileName, base64Data, { base64: true });
    showPreview(item, newFileName);
  });
  zip.generateAsync({ type: 'blob' }).then(content => {
    let zipUrl = URL.createObjectURL(content);
    downloadLink.href = zipUrl;
    downloadLink.download = baseName + '_converted.zip';
    downloadLink.style.display = 'inline-block';
    downloadLink.textContent = 'Download ZIP of Converted Pages';
  });
}
